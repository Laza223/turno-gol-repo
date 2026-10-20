'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, LocateFixed, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PORTAL_BUTTON_OUTLINE,
  PORTAL_LINK,
  PORTAL_SECTION_TITLE,
} from '@/components/world/PortalAuthFrame'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CityCount } from '@/modules/tenants/search.service'
import { useNearby, type NearbyComplex, type NearbyState } from './nearby-context'
import { distanceLabel, formatsLabel, HERO_COUNT, RADIUS_STEPS_KM } from './nearby'

const MAX_KM = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1]
/** El tope que pide la búsqueda: con esa cantidad en zona, "N" dejaría de ser exacto. */
const SEARCH_LIMIT = 30

const CARD = 'relative rounded-xl border border-border bg-card'
/** Blanco táctil de 44 px: el link de texto no es una palabra suelta dentro de un párrafo. */
const TEXT_LINK = cn(
  'inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-400',
  PORTAL_LINK,
)
/** El link que cubre toda la tarjeta: el nombre del complejo. */
const CARD_LINK =
  'rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

function Cover({ t, sizes, className }: { t: NearbyComplex; sizes: string; className: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {t.coverUrl ? (
        <Image
          src={t.coverUrl}
          alt={`Cancha de ${t.name}`}
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-full w-full items-center justify-center font-display text-2xl font-extrabold text-muted-foreground"
        >
          {t.name.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  )
}

const pillClass = cn(
  'relative z-10 inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl border border-input bg-card px-1 text-base min-[375px]:min-w-[4.5rem] min-[375px]:px-3 font-semibold tabular-nums text-foreground transition-colors hover:bg-accent',
  PORTAL_LINK,
)

/** Los horarios: cuatro en una fila (grilla) debajo de 375 px; desde ahí, fluyen y se envuelven. */
const SLOTS_ROW = 'grid grid-cols-4 gap-2 min-[375px]:flex min-[375px]:flex-wrap'

/** Cuatro horarios en esqueleto: lo que ocupa "Libre hoy" mientras carga o se espera la ubicación. */
function SlotsSkeleton() {
  return (
    <div className={cn(SLOTS_ROW, 'mt-4')} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="skeleton h-11 min-[375px]:w-[4.5rem] rounded-xl" />
      ))}
    </div>
  )
}

function Slots({ t }: { t: NearbyComplex }) {
  if (t.slots === undefined) return <SlotsSkeleton />
  // `null` = la disponibilidad no cargó: NO es "no hay turnos", y la salida es la ficha.
  if (t.slots === null) {
    return (
      <div className="relative z-10 mt-4 text-sm text-muted-foreground">
        <p>No pudimos cargar los horarios.</p>
        <Link href={`/${t.slug}`} className={TEXT_LINK}>
          Ver el complejo
        </Link>
      </div>
    )
  }
  if (t.slots.length === 0) {
    return (
      <div className="relative z-10 mt-4 text-sm text-muted-foreground">
        <p>Hoy no le quedan turnos libres.</p>
        <Link href={`/${t.slug}`} className={TEXT_LINK}>
          Ver otros días
        </Link>
      </div>
    )
  }
  return (
    <div className="mt-4" role="group" aria-label={`Turnos libres hoy en ${t.name}`}>
      <p className="text-sm font-semibold text-foreground">Libre hoy</p>
      <div className={cn(SLOTS_ROW, 'mt-2')}>
        {t.slots.map((s) => (
          <Link
            key={s.time}
            href={s.href}
            className={pillClass}
            aria-label={`Reservar hoy a las ${s.time}`}
          >
            {s.time}
          </Link>
        ))}
      </div>
    </div>
  )
}

function MainCard({ t }: { t: NearbyComplex }) {
  const formats = formatsLabel(t.courtFormats)
  return (
    <article className={cn(CARD, 'p-3 sm:p-4')}>
      <Cover t={t} sizes="(min-width: 1024px) 640px, 100vw" className="aspect-[3/1] rounded-lg" />
      <div className="pt-4">
        <h2 className={PORTAL_SECTION_TITLE}>
          <Link href={`/${t.slug}`} className={CARD_LINK}>
            {t.name}
          </Link>
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span>{t.city}</span>
          <span aria-hidden>·</span>
          <span className="font-medium text-foreground">{distanceLabel(t.distanceKm)}</span>
          {formats && (
            <>
              <span aria-hidden>·</span>
              <span>{formats}</span>
            </>
          )}
        </p>
        {t.fromPriceCents != null && (
          <p className="mt-1 text-sm text-muted-foreground">
            Turno desde{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatArs(t.fromPriceCents)}
            </span>
          </p>
        )}
        <Slots t={t} />
      </div>
    </article>
  )
}

function Row({ t }: { t: NearbyComplex }) {
  const next = t.slots?.[0]
  return (
    <article className={cn(CARD, 'flex flex-wrap items-center gap-x-3 gap-y-1 p-3')}>
      <Cover t={t} sizes="72px" className="h-16 w-[72px] shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-base font-semibold text-foreground">
          <Link href={`/${t.slug}`} className={CARD_LINK}>
            {t.name}
          </Link>
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {distanceLabel(t.distanceKm)}
        </p>
      </div>
      {t.slots === undefined ? (
        <span className="skeleton h-11 w-16 shrink-0 rounded-xl" aria-hidden />
      ) : next ? (
        <Link
          href={next.href}
          className={cn(pillClass, 'min-w-[4.5rem] px-3')}
          aria-label={`Reservar hoy a las ${next.time} en ${t.name}`}
        >
          {next.time}
        </Link>
      ) : t.slots !== null ? (
        <span className="shrink-0 text-sm text-muted-foreground">Sin turnos hoy</span>
      ) : null}
      {/* La fila entera ya lleva a la ficha (el link del nombre cubre la tarjeta). */}
      {t.slots === null && (
        <p className="w-full text-sm text-muted-foreground">No pudimos cargar los horarios.</p>
      )}
    </article>
  )
}

function ZoneChips({ cities }: { cities: CityCount[] }) {
  const top = [...cities].sort((a, b) => b.count - a.count).slice(0, 6)
  if (top.length === 0) {
    return (
      <Link
        href="/explorar"
        className={cn('mt-4 inline-flex min-h-11 items-center gap-1.5', TEXT_LINK)}
      >
        Ver todas las canchas <ArrowRight className="size-4" aria-hidden />
      </Link>
    )
  }
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Zonas con canchas en TurnoGol">
      {top.map((c) => (
        <li key={`${c.city}||${c.province}`}>
          <Link
            href={`/explorar?${new URLSearchParams({ city: c.city, province: c.province })}`}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent',
              PORTAL_LINK,
            )}
          >
            {c.city}
            <span className="font-normal tabular-nums text-muted-foreground">{c.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const FALLBACK_COPY: Record<
  Exclude<NearbyState['status'], 'found'>,
  { title: string; body: string }
> = {
  locating: {
    title: 'Buscamos la cancha más cerca tuyo',
    body: 'Con tu ubicación te mostramos las canchas de tu zona y sus turnos libres de hoy.',
  },
  denied: {
    title: 'Sin tu ubicación no sabemos qué te queda cerca',
    body: 'Elegí tu zona y te mostramos sus canchas:',
  },
  unsupported: {
    title: 'Elegí tu zona',
    body: 'Te mostramos las canchas que tiene y sus turnos libres:',
  },
  error: {
    title: 'No pudimos cargar las canchas cercanas',
    body: 'Mientras tanto, elegí tu zona:',
  },
  none: {
    title: `Todavía no hay canchas en TurnoGol a menos de ${MAX_KM} km tuyo`,
    body: 'Estas son las zonas donde ya se puede reservar:',
  },
}

function FallbackCard({
  status,
  cities,
}: {
  status: Exclude<NearbyState['status'], 'found'>
  cities: CityCount[]
}) {
  const { locate } = useNearby()
  const copy = FALLBACK_COPY[status]
  return (
    <div
      className={cn(CARD, status === 'locating' ? 'p-3 sm:p-4' : 'p-4 sm:p-6')}
      aria-live="polite"
    >
      {/* Mientras se espera la ubicación, la silueta de la tarjeta principal (portada y cuatro
          horarios): así no hay salto de alto cuando llegan las canchas. */}
      {status === 'locating' && (
        <div aria-hidden className="skeleton mb-4 aspect-[3/1] w-full rounded-lg" />
      )}
      <h2 className={PORTAL_SECTION_TITLE}>{copy.title}</h2>
      <p className="mt-2 text-base text-muted-foreground">{copy.body}</p>
      {status === 'locating' ? (
        <>
          <SlotsSkeleton />
          <Button
            type="button"
            variant="outline"
            className={cn(PORTAL_BUTTON_OUTLINE, 'mt-4 rounded-xl sm:w-auto sm:px-6')}
            onClick={locate}
          >
            <LocateFixed className="mr-2 size-4" aria-hidden />
            Usar mi ubicación
          </Button>
        </>
      ) : (
        <ZoneChips cities={cities} />
      )}
    </div>
  )
}

/**
 * La prueba de la home: la cancha real que te queda cerca, con sus turnos libres de hoy como
 * links de reserva, y las dos que siguen. Qué canchas y en qué orden: `nearby.ts`.
 */
export function NearbyPanel({ cities }: { cities: CityCount[] }) {
  const { state } = useNearby()
  if (state.status !== 'found') return <FallbackCard status={state.status} cities={cities} />

  const [main, ...rest] = state.complexes
  const { lat, lng } = state.coords
  return (
    <div className="flex flex-col gap-3">
      {main && <MainCard t={main} />}
      {rest.map((t) => (
        <Row key={t.id} t={t} />
      ))}
      {state.inZone > HERO_COUNT && (
        <Link
          href={`/explorar?${new URLSearchParams({ sort: 'distance', lat: String(lat), lng: String(lng) })}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 self-center text-base font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-400',
            PORTAL_LINK,
          )}
        >
          {state.inZone >= SEARCH_LIMIT
            ? 'Ver todas las canchas cerca tuyo'
            : `Ver las ${state.inZone} canchas cerca tuyo`}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}
