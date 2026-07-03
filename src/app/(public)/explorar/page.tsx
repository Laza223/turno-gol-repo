import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import {
  getCourtPhotosByTenant,
  listPublicCities,
  searchPublicTenants,
  type SortOption,
} from '@/modules/tenants/search.service'
import {
  findAvailableTenantIds,
  findFreeSlotPillsByTenant,
  parseAvailabilitySearchParams,
  type SlotPill,
} from '@/modules/tenants/availability-search.service'
import { buildMetadata, absoluteUrl } from '@/lib/seo/metadata'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { playerFavorites } from '@/shared/db/schema'
import { eq } from 'drizzle-orm'
import { List } from 'lucide-react'
import TenantCard from './components/TenantCard'
import ExplorarToolbar from './components/ExplorarToolbar'
import ExplorarFilters from './components/ExplorarFilters'
import ExplorarSplitView from './components/ExplorarSplitView'
import SearchBand from './components/SearchBand'
import QuickFilters from './components/QuickFilters'
import EmptyResults from './components/EmptyResults'
import JsonLd from '@/components/seo/JsonLd'
import { buildBreadcrumbList } from '@/lib/seo/structured-data'

// Limitación de Next 14: una página que lee `searchParams` es SIEMPRE dynamic;
// no existe ISR condicional por searchParams (PPR es experimental y no se usa).
// Además los favoritos del jugador leen cookies. El cacheo acá es de DATOS: la
// carga inicial sin filtros y el listado de ciudades salen de unstable_cache
// (5 min) en vez de pegarle a la DB de búsqueda en cada visita.
export const metadata = buildMetadata({
  title: 'Complejos de fútbol con reserva online',
  description: 'Descubrí complejos de fútbol en tu ciudad con disponibilidad en tiempo real. Filtrá por superficie, formato y precio. Reservá al instante.',
  path: '/explorar',
})

const PAGE_SIZE = 12
const SORTS: SortOption[] = ['name', 'price', 'rating', 'distance']

// Camino caliente de /explorar: la primera carga sin ningún filtro es idéntica
// para todos los visitantes → cacheada 5 min en el Data Cache. OJO: nada que
// lea cookies()/headers() puede ejecutarse ADENTRO de unstable_cache (los
// favoritos del jugador quedan afuera, en el render de la página).
const getDefaultSearchCached = unstable_cache(
  () => searchPublicTenants({ limit: PAGE_SIZE, offset: 0 }),
  ['explorar-default-search'],
  { revalidate: 300 },
)

// El listado de ciudades no depende de filtros ni de sesión: cacheado siempre.
const listPublicCitiesCached = unstable_cache(
  () => listPublicCities(),
  ['explorar-cities'],
  { revalidate: 300 },
)

type SP = Record<string, string | undefined>

function csv(v: string | undefined): string[] {
  return v ? v.split(',').filter(Boolean) : []
}
function num(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Construye una URL de /explorar preservando los filtros actuales (server-side). */
function pageUrl(sp: SP, offset: number): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== 'offset') p.set(k, v)
  }
  p.set('offset', String(offset))
  return `/explorar?${p.toString()}`
}

async function getPlayerFavoriteIds(playerId: string): Promise<Set<string>> {
  try {
    const rows = await withPlayerContext(playerId, (tx) =>
      tx.select({ tenantId: playerFavorites.tenantId }).from(playerFavorites).where(eq(playerFavorites.playerId, playerId)),
    )
    return new Set(rows.map((r) => r.tenantId))
  } catch {
    return new Set()
  }
}

export default async function ExplorarPage({ searchParams }: { searchParams: SP }) {
  const offset = Math.max(num(searchParams.offset) ?? 0, 0)
  const view = searchParams.view === 'map' ? 'map' : 'list'
  const sort = SORTS.includes(searchParams.sort as SortOption)
    ? (searchParams.sort as SortOption)
    : undefined
  // En el mapa mostramos más pines de una (sin paginar).
  const limit = view === 'map' ? 50 : PAGE_SIZE

  const authUser = await extractAuthUser().catch(() => null)
  const playerId = authUser?.type === 'player' ? authUser.playerId : null
  const favoriteIds = playerId ? await getPlayerFavoriteIds(playerId) : new Set<string>()

  const formats = csv(searchParams.formats).map(Number).filter((n) => Number.isFinite(n))

  // Disponibilidad real: con fecha+hora válidas en la URL, la búsqueda queda
  // restringida a complejos con al menos una cancha libre a esa hora (cacheado
  // 30s en Upstash). Sin el par completo, el comportamiento es el histórico.
  const avail = parseAvailabilitySearchParams({
    date: searchParams.date,
    time: searchParams.time,
  })
  const tenantIds = avail
    ? await findAvailableTenantIds({
        ...avail,
        ...(formats.length ? { formats } : {}),
      })
    : undefined

  // Búsqueda default = vista lista, primera página y CERO filtros/orden/geo/
  // disponibilidad: es el grueso del tráfico y es idéntica para todos.
  const isDefaultSearch =
    view === 'list' &&
    offset === 0 &&
    !sort &&
    !avail &&
    formats.length === 0 &&
    !searchParams.q &&
    !searchParams.city &&
    !searchParams.province &&
    searchParams.online !== '1' &&
    !searchParams.surfaces &&
    !searchParams.amenities &&
    num(searchParams.minPrice) === undefined &&
    num(searchParams.maxPrice) === undefined &&
    num(searchParams.lat) === undefined &&
    num(searchParams.lng) === undefined

  const [{ results, total }, cities] = await Promise.all([
    isDefaultSearch
      ? getDefaultSearchCached()
      : searchPublicTenants({
          q: searchParams.q,
          city: searchParams.city,
          province: searchParams.province,
          onlineOnly: searchParams.online === '1',
          surfaces: csv(searchParams.surfaces),
          formats,
          amenities: csv(searchParams.amenities),
          minPriceCents: num(searchParams.minPrice),
          maxPriceCents: num(searchParams.maxPrice),
          sort,
          lat: num(searchParams.lat),
          lng: num(searchParams.lng),
          limit,
          offset,
          ...(tenantIds !== undefined ? { tenantIds } : {}),
        }),
    listPublicCitiesCached(),
  ])

  const hasMore = view === 'list' && offset + PAGE_SIZE < total

  // Extras de las cards (solo la vista lista las renderiza), en paralelo y
  // fail-open: sin fotos la card cae al coverUrl; sin pills no muestra turnos.
  const wantCardExtras = view === 'list' && results.length > 0
  const [photosByTenant, pillsByTenant] = await Promise.all([
    wantCardExtras
      ? getCourtPhotosByTenant(results.map((t) => t.id)).catch(
          () => ({}) as Record<string, string[]>,
        )
      : ({} as Record<string, string[]>),
    wantCardExtras && avail
      ? findFreeSlotPillsByTenant({
          tenantIds: results.filter((t) => t.allowOnlineBooking).map((t) => t.id),
          date: avail.date,
          time: avail.time,
          ...(formats.length ? { formats } : {}),
        }).catch(() => ({}) as Record<string, SlotPill[]>)
      : ({} as Record<string, SlotPill[]>),
  ])

  const _listHrefParams = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'view' && k !== 'offset') _listHrefParams.set(k, v)
  }
  const listHref = `/explorar${_listHrefParams.toString() ? `?${_listHrefParams.toString()}` : ''}`

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={buildBreadcrumbList([
          { name: 'Inicio', url: absoluteUrl('/') },
          { name: 'Explorar', url: absoluteUrl('/explorar') },
        ])}
      />
      <SearchBand cities={cities} />

      <div className="sticky top-16 z-20 -mx-4 space-y-2 border-b border-border bg-card/85 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-6 lg:px-8">
        <QuickFilters />
        <ExplorarToolbar total={total} />
      </div>

      <div className={view === 'map' ? '' : 'lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-6'}>
        {view === 'list' && (
          <aside className="hidden lg:block">
            <div className="sticky top-20 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <ExplorarFilters />
            </div>
          </aside>
        )}

        <div className="min-w-0">
          {view === 'map' ? (
            <ExplorarSplitView
              results={results}
              favoritedIds={Array.from(favoriteIds)}
            />
          ) : results.length === 0 ? (
            <EmptyResults avail={avail ? { date: avail.date, time: avail.time } : null} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((t) => {
                  const pills = pillsByTenant[t.id]
                  return (
                    <TenantCard
                      key={t.id}
                      tenant={t}
                      initialFavorited={favoriteIds.has(t.id)}
                      photos={photosByTenant[t.id] ?? []}
                      slotPills={
                        avail && pills?.length ? { date: avail.date, slots: pills } : undefined
                      }
                    />
                  )
                })}
              </div>

                {hasMore && (
                  <div className="mt-10 flex justify-center">
                    <Link
                      href={pageUrl(searchParams, offset + PAGE_SIZE)}
                      className="inline-flex h-11 items-center rounded-full border border-border bg-card px-7 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/60 hover:text-emerald-700 dark:hover:text-emerald-400 hover:shadow-md motion-reduce:hover:translate-y-0"
                    >
                      Ver más complejos
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      {/* FAB mobile: solo visible en vista mapa en pantallas < lg */}
      {view === 'map' && (
        <Link
          href={listHref}
          className="fixed bottom-20 left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/30 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:active:scale-100 lg:hidden dark:shadow-emerald-500/25"
        >
          <List className="h-4 w-4" aria-hidden /> Ver lista
        </Link>
      )}
    </div>
  )
}
