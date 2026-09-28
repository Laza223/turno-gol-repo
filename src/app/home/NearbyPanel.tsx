'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, LocateFixed, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatArs } from '@/lib/format'
import type { CityCount } from '@/modules/tenants/search.service'
import { useNearby, type NearbyComplex, type NearbyState } from './nearby-context'
import { distanceLabel, formatsLabel, HERO_COUNT, RADIUS_STEPS_KM } from './nearby'

const MAX_KM = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1]
/** El tope que pide la búsqueda: con esa cantidad en zona, "N" dejaría de ser exacto. */
const SEARCH_LIMIT = 30

function Cover({ t, sizes, className }: { t: NearbyComplex; sizes: string; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-muted ${className}`}>
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
          className="mockup-cover flex h-full w-full items-center justify-center font-display text-3xl font-black italic text-emerald-800/50 dark:text-emerald-200/60"
        >
          {t.name.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  )
}

const pillClass =
  'relative z-10 inline-flex h-11 min-w-[66px] items-center justify-center rounded-full border-[1.5px] border-emerald-600 px-3 text-[15px] sm:h-12 sm:min-w-[100px] sm:px-5 sm:text-base font-semibold tabular-nums text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-emerald-400 dark:bg-white/[.03]'

function MainCard({ t }: { t: NearbyComplex }) {
  const formats = formatsLabel(t.courtFormats)
  return (
    <article className="mockup-card relative rounded-2xl p-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <Cover
        t={t}
        sizes="(min-width: 1024px) 680px, 100vw"
        className="aspect-[2.2/1] rounded-xl lg:aspect-auto lg:h-[274px]"
      />
      <div className="px-3 pb-4 pt-4 sm:px-5 sm:pb-5">
        <h2 className="font-display text-[28px] font-black italic leading-tight tracking-[-0.02em] text-foreground sm:text-[40px]">
          <Link
            href={`/${t.slug}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.name}
          </Link>
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px] text-muted-foreground sm:text-[17px]">
          <MapPin
            className="h-[18px] w-[18px] shrink-0 text-emerald-700 dark:text-emerald-400"
            aria-hidden
          />
          <span>{t.city}</span>
          <span aria-hidden>·</span>
          <span className="font-medium text-emerald-800 dark:text-emerald-400">
            {distanceLabel(t.distanceKm)}
          </span>
          {formats && (
            <>
              <span aria-hidden>·</span>
              <span>{formats}</span>
            </>
          )}
        </p>
        {t.fromPriceCents != null && (
          <p className="mt-2 text-[16px] text-muted-foreground sm:text-[19px]">
            Turno desde{' '}
            <span className="font-bold tabular-nums text-foreground">
              {formatArs(t.fromPriceCents)}
            </span>
          </p>
        )}
        <Slots t={t} />
      </div>
    </article>
  )
}

function Slots({ t }: { t: NearbyComplex }) {
  if (t.slots === undefined) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3" aria-hidden>
        <span className="skeleton h-5 w-20 rounded" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton h-11 w-[66px] rounded-full sm:h-12 sm:w-[100px]" />
        ))}
      </div>
    )
  }
  if (t.slots.length === 0) {
    return (
      <p className="relative z-10 mt-5 text-[15px] text-muted-foreground">
        Hoy no le quedan turnos libres.{' '}
        <Link
          href={`/${t.slug}`}
          className="font-semibold text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-400"
        >
          Ver otros días
        </Link>
      </p>
    )
  }
  return (
    <div
      className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3"
      role="group"
      aria-label={`Turnos libres hoy en ${t.name}`}
    >
      <span className="w-full text-[17px] font-semibold text-emerald-800 sm:text-[19px] xl:mr-4 xl:w-auto dark:text-emerald-400">
        Libre hoy
      </span>
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
  )
}

function Row({ t }: { t: NearbyComplex }) {
  const next = t.slots?.[0]
  return (
    <article className="card-premium card-premium-interactive relative grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl p-3 sm:grid-cols-[130px_minmax(0,1fr)_176px] sm:gap-6 sm:py-3 sm:pl-[22px] sm:pr-0 lg:grid-cols-[104px_minmax(0,1fr)_auto] lg:gap-4 lg:pr-5 xl:grid-cols-[130px_minmax(0,1fr)_176px] xl:gap-6 xl:pr-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <Cover
        t={t}
        sizes="130px"
        className="h-[68px] rounded-lg sm:h-[92px] lg:h-[78px] xl:h-[92px]"
      />
      <div className="min-w-0">
        <h3 className="truncate font-display text-[19px] font-black italic tracking-[-0.02em] text-foreground sm:text-[26px] lg:text-[22px] xl:text-[26px]">
          <Link
            href={`/${t.slug}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.name}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-2 text-[15px] text-muted-foreground sm:text-[17px]">
          <MapPin
            className="h-[18px] w-[18px] shrink-0 text-emerald-700 dark:text-emerald-400"
            aria-hidden
          />
          {distanceLabel(t.distanceKm)}
        </p>
      </div>
      <div className="flex h-14 flex-col justify-center border-l border-border pl-4 sm:pl-7 dark:border-white/10">
        {t.slots === undefined ? (
          <span className="skeleton h-9 w-14 rounded" aria-hidden />
        ) : next ? (
          <Link
            href={next.href}
            className="relative z-10 rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Reservar hoy a las ${next.time} en ${t.name}`}
          >
            <span className="block text-[14px] font-semibold text-emerald-800 dark:text-emerald-400 sm:text-[16px]">
              Libre
            </span>
            <span className="block text-[19px] font-bold tabular-nums text-foreground sm:text-[22px]">
              {next.time}
            </span>
          </Link>
        ) : (
          <span className="text-[14px] text-muted-foreground">Sin turnos hoy</span>
        )}
      </div>
    </article>
  )
}

function ZoneChips({ cities }: { cities: CityCount[] }) {
  const top = [...cities].sort((a, b) => b.count - a.count).slice(0, 6)
  if (top.length === 0) {
    return (
      <Link
        href="/explorar"
        className="mt-4 inline-flex items-center gap-1.5 font-semibold text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-400"
      >
        Ver todas las canchas <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    )
  }
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Zonas con canchas en TurnoGol">
      {top.map((c) => (
        <li key={`${c.city}||${c.province}`}>
          <Link
            href={`/explorar?${new URLSearchParams({ city: c.city, province: c.province })}`}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-emerald-800 dark:border-white/15 dark:bg-white/[.04] dark:hover:text-emerald-400"
          >
            {c.city}
            <span className="tabular-nums text-muted-foreground">{c.count}</span>
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
    <div className="mockup-card rounded-2xl p-2">
      <div className="relative hidden h-[274px] overflow-hidden rounded-xl sm:block">
        <Image
          src="/bg-hero-desktop.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 680px, 100vw"
          className="object-cover object-[center_35%]"
        />
      </div>
      <div className="px-3 pb-4 pt-4 sm:px-5 sm:pb-5" aria-live="polite">
        <h2 className="font-display text-[24px] font-black italic leading-tight tracking-[-0.02em] text-foreground sm:text-[32px]">
          {copy.title}
        </h2>
        <p className="mt-2 text-[16px] text-muted-foreground sm:text-[17px]">{copy.body}</p>
        {status === 'locating' ? (
          <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={locate}>
            <LocateFixed className="mr-2 h-4 w-4" aria-hidden />
            Usar mi ubicación
          </Button>
        ) : (
          <ZoneChips cities={cities} />
        )}
      </div>
    </div>
  )
}

/**
 * La prueba del hero: la cancha real que te queda cerca, con sus turnos libres
 * de hoy como botones de reserva, y las dos que siguen. Qué canchas y en qué
 * orden: `nearby.ts`.
 */
export function NearbyPanel({ cities }: { cities: CityCount[] }) {
  const { state } = useNearby()
  if (state.status !== 'found') return <FallbackCard status={state.status} cities={cities} />

  const [main, ...rest] = state.complexes
  const { lat, lng } = state.coords
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {main && <MainCard t={main} />}
      {rest.map((t) => (
        <Row key={t.id} t={t} />
      ))}
      {state.inZone > HERO_COUNT && (
        <Link
          href={`/explorar?${new URLSearchParams({ sort: 'distance', lat: String(lat), lng: String(lng) })}`}
          className="inline-flex items-center gap-1.5 self-center text-[15px] font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {state.inZone >= SEARCH_LIMIT
            ? 'Ver todas las canchas cerca tuyo'
            : `Ver las ${state.inZone} canchas cerca tuyo`}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}
