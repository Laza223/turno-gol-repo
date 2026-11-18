import { Suspense, ViewTransition } from 'react'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { List, Map as MapIcon } from 'lucide-react'
import { eq } from 'drizzle-orm'
import { PUBLIC_CITIES_TAG, PUBLIC_TENANTS_TAG } from '@/shared/cache/public-listings'
import {
  effectiveSort,
  getCourtPhotosByTenant,
  listPublicCities,
  listPublicFormatSets,
  searchPublicTenants,
} from '@/modules/tenants/search.service'
import {
  findTodayFreeSlotsByTenant,
  type TodayFreeSlots,
} from '@/modules/tenants/availability-search.service'
import { searchLocalities } from '@/modules/geo/localities.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import { formatsLabel } from '@/lib/formats-label'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { playerFavorites } from '@/shared/db/schema'
import JsonLd from '@/components/seo/JsonLd'
import { buildBreadcrumbList } from '@/lib/seo/structured-data'
import TenantCard from './components/TenantCard'
import ExplorarSearch from './components/ExplorarSearch'
import ExplorarSplitView from './components/ExplorarSplitView'
import EmptyResults from './components/EmptyResults'
import FirstEntry from './components/FirstEntry'
import { buildExplorarUrl } from './components/url'
import './explorar.css'

// Esta página es SIEMPRE dinámica, por dos causas independientes: lee
// `searchParams` y los favoritos del jugador leen cookies. El cacheo acá es de
// DATOS: la carga inicial sin filtros, el listado de ciudades y los tamaños por
// localidad salen de unstable_cache (5 min) en vez de pegarle a la DB en cada
// visita. Las entradas están etiquetadas, así que un cambio en el panel del
// complejo las refresca sin esperar el TTL (`@/shared/cache/public-listings`).
export const metadata = buildMetadata({
  title: 'Complejos de fútbol con reserva online',
  description:
    'Descubrí complejos de fútbol en tu ciudad con los horarios libres de hoy a la vista. Elegí la localidad y el tamaño de cancha, y reservá al instante.',
  path: '/explorar',
})

const PAGE_SIZE = 12

// Camino caliente de /explorar: la primera carga sin ningún filtro es idéntica
// para todos los visitantes → cacheada 5 min en el Data Cache. OJO: nada que
// lea cookies()/headers() puede ejecutarse ADENTRO de unstable_cache (los
// favoritos del jugador quedan afuera, en el render de la página).
const getDefaultSearchCached = unstable_cache(
  () => searchPublicTenants({ limit: PAGE_SIZE, offset: 0 }),
  ['explorar-default-search'],
  { revalidate: 300, tags: [PUBLIC_TENANTS_TAG] },
)

// El listado de ciudades no depende de filtros ni de sesión: cacheado siempre.
const listPublicCitiesCached = unstable_cache(() => listPublicCities(), ['explorar-cities'], {
  revalidate: 300,
  tags: [PUBLIC_CITIES_TAG],
})

// Los tamaños de cada complejo de una localidad (la hoja de Cancha): la clave incluye la localidad,
// por eso solo se cachean las localidades que existen (una ciudad inventada en la URL no crea una
// entrada de caché por valor).
const listPublicFormatSetsCached = unstable_cache(
  (city: string, province: string) =>
    listPublicFormatSets({ city: city || undefined, province: province || undefined }),
  ['explorar-format-sets'],
  { revalidate: 300, tags: [PUBLIC_TENANTS_TAG] },
)

type SP = Record<string, string | undefined>

/**
 * Los únicos parámetros que lee el buscador (decisión de Lazar del 2026-11-14): Localidad, Cancha,
 * nombre, ubicación, vista y página. Un link viejo con fecha, hora, superficie, precio u orden
 * abre igual: esos filtros se ignoran.
 */
const KNOWN_PARAMS = ['city', 'province', 'formats', 'q', 'lat', 'lng', 'view', 'offset'] as const

function num(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function knownParams(sp: SP): URLSearchParams {
  const p = new URLSearchParams()
  for (const k of KNOWN_PARAMS) {
    const v = sp[k]
    if (v) p.set(k, v)
  }
  return p
}

async function getPlayerFavoriteIds(playerId: string): Promise<Set<string>> {
  try {
    const rows = await withPlayerContext(playerId, (tx) =>
      tx
        .select({ tenantId: playerFavorites.tenantId })
        .from(playerFavorites)
        .where(eq(playerFavorites.playerId, playerId)),
    )
    return new Set(rows.map((r) => r.tenantId))
  } catch {
    return new Set()
  }
}

/**
 * Una localidad sin complejos no es un callejón: se muestran los más cercanos. El origen sale de
 * `lat`/`lng` de la URL; un link viejo no los trae y se resuelven acá con el dataset de localidades.
 */
async function findNearby(args: {
  city: string
  province: string | undefined
  lat: number | undefined
  lng: number | undefined
  formats: number[]
  limit: number
}) {
  let { lat, lng } = args
  if (lat === undefined || lng === undefined) {
    const origin = searchLocalities(`${args.city} ${args.province ?? ''}`, { limit: 5 }).find(
      (l) => l.lat !== null && l.lng !== null,
    )
    lat = origin?.lat ?? undefined
    lng = origin?.lng ?? undefined
  }
  if (lat === undefined || lng === undefined) return null
  const near = await searchPublicTenants({
    formats: args.formats,
    lat,
    lng,
    sort: 'distance',
    limit: args.limit,
    offset: 0,
  })
  return near.results.length > 0 ? near : null
}

/** "6 complejos en Luján" / "1 complejo" (encabezado de `buscador.html`). */
function headline(total: number, city: string | undefined): string {
  const n = total === 1 ? '1 complejo' : `${total} complejos`
  return city ? `${n} en ${city}` : n
}

export default async function ExplorarPage(props: { searchParams: Promise<SP> }) {
  const searchParams = await props.searchParams
  const params = knownParams(searchParams)
  const offset = Math.max(num(searchParams.offset) ?? 0, 0)
  const view = searchParams.view === 'map' ? 'map' : 'list'
  // En el mapa mostramos más pines de una (sin paginar).
  const limit = view === 'map' ? 50 : PAGE_SIZE
  const city = searchParams.city || undefined
  const province = searchParams.province || undefined
  const q = searchParams.q?.trim() || undefined
  const lat = num(searchParams.lat)
  const lng = num(searchParams.lng)

  const authUser = await extractAuthUser().catch(() => null)
  const playerId = authUser?.type === 'player' ? authUser.playerId : null
  const favoriteIds = playerId ? await getPlayerFavoriteIds(playerId) : new Set<string>()

  const formats = (searchParams.formats ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)

  // Búsqueda default = vista lista, primera página y CERO filtros/geo: es el grueso del tráfico y
  // es idéntica para todos.
  const isDefaultSearch =
    view === 'list' &&
    offset === 0 &&
    formats.length === 0 &&
    !q &&
    !city &&
    !province &&
    lat === undefined &&
    lng === undefined

  const [first, cities] = await Promise.all([
    isDefaultSearch
      ? getDefaultSearchCached()
      : searchPublicTenants({
          q,
          city,
          province,
          formats,
          lat,
          lng,
          // Con la ubicación en la URL (la zona del jugador), los más cercanos primero.
          sort: effectiveSort('distance', lat, lng),
          limit,
          offset,
        }),
    listPublicCitiesCached(),
  ])
  const knownCity =
    !city || cities.some((c) => c.city === city && (!province || c.province === province))
  // La localidad NO tiene complejos (y no se buscó un nombre): los más cercanos, con aviso. Si
  // tiene y el filtro de tamaño no dejó ninguno, el aviso "todavía no hay complejos" mentiría.
  const nearby =
    city && !q && !knownCity && first.total === 0 && offset === 0
      ? await findNearby({ city, province, lat, lng, formats, limit })
      : null
  const { results, total } = nearby ?? first
  // En "más cercanos" los tamaños salen de los complejos que se ven: la hoja de Cancha no miente.
  const formatSets = nearby
    ? results.map((t) => t.courtFormats)
    : knownCity
      ? await listPublicFormatSetsCached(city ?? '', province ?? '')
      : await listPublicFormatSets({ city, province })

  const hasMore = !nearby && view === 'list' && offset + PAGE_SIZE < total

  // Extras de las tarjetas (solo la vista lista las renderiza), en paralelo y fail-open: sin
  // fotos la tarjeta cae a la portada. Si los horarios fallan (null), la tarjeta no dice nada de
  // hoy: "no le quedan horarios" sería mentira.
  const wantCardExtras = view === 'list' && results.length > 0
  const [photosByTenant, todayByTenant] = await Promise.all([
    wantCardExtras
      ? getCourtPhotosByTenant(results.filter((t) => !t.coverUrl).map((t) => t.id)).catch(
          () => ({}) as Record<string, string[]>,
        )
      : ({} as Record<string, string[]>),
    wantCardExtras
      ? findTodayFreeSlotsByTenant({
          tenantIds: results.filter((t) => t.allowOnlineBooking).map((t) => t.id),
          ...(formats.length ? { formats } : {}),
        }).catch((err: unknown) => {
          Sentry.captureException(err, { tags: { section: 'explorar.today-slots' } })
          return null
        })
      : ({} as Record<string, TodayFreeSlots>),
  ])

  const sizes = formatsLabel(formats)
  const subtitle = [
    nearby ? `Todavía no hay complejos en ${city}. Estos son los más cercanos.` : null,
    sizes ? `Con cancha de ${sizes}.` : null,
    q ? `Que se llaman “${q}”.` : null,
    view === 'list' ? 'Los horarios son los libres de hoy.' : null,
  ]
    .filter(Boolean)
    .join(' ')
  const listHref = buildExplorarUrl(params, { view: undefined })
  const mapHref = buildExplorarUrl(params, { view: 'map' })
  const pageHref = buildExplorarUrl(
    params,
    { offset: String(offset + PAGE_SIZE) },
    { resetOffset: false },
  )
  // La lista cambia con un fundido cruzado al cambiar un filtro (`key` = la búsqueda).
  const searchKey = buildExplorarUrl(params, { offset: undefined, view: undefined })
  const pillLink = cn(
    buttonVariants({ variant: 'pill-glass', size: 'pill-sm' }),
    'glass shrink-0 gap-2 px-[18px]',
  )

  return (
    <div className="portal-ambient min-h-svh">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-10 sm:px-6 md:pt-10 lg:px-8">
        <JsonLd
          data={buildBreadcrumbList([
            { name: 'Inicio', url: absoluteUrl('/') },
            { name: 'Explorar', url: absoluteUrl('/explorar') },
          ])}
        />
        <Suspense
          fallback={<div className="glass h-[76px] rounded-[32px] md:w-[560px] md:rounded-full" />}
        >
          <ExplorarSearch cities={cities} formatSets={formatSets} nearby={Boolean(nearby)} />
        </Suspense>

        <div className="mt-6 mb-4 flex items-end justify-between gap-4 md:mt-8 md:mb-5">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(26px,2.4vw+16px,40px)] leading-[1.05] font-bold tracking-[-0.035em] text-portal-ink [font-stretch:104%]">
              {nearby ? `Complejos cerca de ${city}` : headline(total, city)}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-[15px] leading-[1.4] text-portal-soft">{subtitle}</p>
            )}
          </div>
          {view === 'list' ? (
            <Link href={mapHref} className={pillLink}>
              <MapIcon className="size-[18px]" aria-hidden />
              Mapa
            </Link>
          ) : (
            <Link href={listHref} className={pillLink}>
              <List className="size-[18px]" aria-hidden />
              Lista
            </Link>
          )}
        </div>

        {view === 'map' ? (
          <ExplorarSplitView results={results} favoritedIds={Array.from(favoriteIds)} />
        ) : results.length === 0 ? (
          <EmptyResults outOfRange={offset > 0} />
        ) : (
          <>
            <ViewTransition
              key={searchKey}
              name="explorar-lista"
              share="explorar-fundido"
              default="none"
            >
              <FirstEntry className="ex-grid">
                {results.map((t, i) => (
                  <TenantCard
                    key={t.id}
                    tenant={t}
                    index={i}
                    initialFavorited={favoriteIds.has(t.id)}
                    photo={t.coverUrl ?? photosByTenant[t.id]?.[0] ?? null}
                    today={todayByTenant ? (todayByTenant[t.id] ?? null) : undefined}
                  />
                ))}
              </FirstEntry>
            </ViewTransition>

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <Link href={pageHref} className={cn(pillLink, 'px-7')}>
                  Ver más complejos
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
