import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/status-tone'
import { RIVAL_LEVEL_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalLevel } from '@/modules/rival/rival.types'

/** El sello "Reservada en TurnoGol": tono success (el verde sutil de la tarjeta, no un botón). */
export function StampBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium',
        TONE_BADGE.success,
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden />
      Reservada en TurnoGol
    </span>
  )
}

/** Un chip de dato (formato, nivel): neutral, sin color de estado. */
export function FactPill({ children }: { children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-medium',
        TONE_BADGE.neutral,
      )}
    >
      {children}
    </span>
  )
}

/** CTA primario de las tarjetas vacías y de "Armar un partido": 44 px, el único verde de la vista. */
export const RIVAL_CTA =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:shadow-emerald-500/25'

/** La receipt card del partido (complejo, día y hora, formato, nivel y sello). Sin personas. */
export function MatchHeader({
  tenantName,
  startsAt,
  format,
  level,
  hasStamp,
  ended = false,
  now,
}: {
  tenantName: string
  startsAt: Date
  format: number
  level: RivalLevel
  hasStamp: boolean
  ended?: boolean
  now: Date
}) {
  return (
    <section
      aria-labelledby="rival-partido"
      className="reserva-receipt-card space-y-3 rounded-2xl p-5"
    >
      <p className="font-logo text-[12px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
        RIVAL powered by TurnoGol
      </p>
      <h1
        id="rival-partido"
        className="break-words font-display text-2xl font-black italic leading-tight tracking-tight text-foreground"
      >
        {tenantName}
      </h1>
      <p className="text-base text-foreground">{whenLabel(startsAt, now)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <FactPill>{formatLabel(format)}</FactPill>
        <FactPill>{RIVAL_LEVEL_LABELS[level]}</FactPill>
        {hasStamp && <StampBadge />}
        {ended && <FactPill>Jugado</FactPill>}
      </div>
    </section>
  )
}

/** "Este partido se cayó." con la salida a "Armar otro". */
export function CanceledCard() {
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-xs">
      <p className="font-display text-2xl font-black italic text-foreground">
        Este partido se cayó.
      </p>
      <Link href="/rival/nuevo" className={RIVAL_CTA}>
        Armar otro
      </Link>
    </section>
  )
}
