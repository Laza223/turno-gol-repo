import Link from 'next/link'
import { BadgeCheck, CalendarX, Plus, Shirt, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { TONE_BADGE } from '@/lib/status-tone'
import { RIVAL_LEVEL_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalLevel } from '@/modules/rival/rival.types'
import { RIVAL_ACTION } from './rival-classes'

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
function FactPill({ children }: { children: string }) {
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

/**
 * El cupo del partido en chiquito, con los números reales: las primeras `confirmed` camisetas
 * (tope `capacity`) rellenas, el resto vacías. Decorativa (`aria-hidden`): quien la usa dice el
 * número en el nombre accesible.
 */
export function MiniShirts({
  capacity,
  confirmed,
  className,
}: {
  capacity: number
  confirmed: number
  className?: string
}) {
  const filled = Math.min(confirmed, capacity)
  return (
    <div aria-hidden className={cn('flex flex-wrap gap-1', className)}>
      {Array.from({ length: capacity }, (_, i) => (
        <Shirt
          key={i}
          className={cn(
            'size-5',
            i < filled
              ? 'fill-emerald-500/25 text-emerald-700 dark:text-emerald-300'
              : 'text-muted-foreground/70',
          )}
        />
      ))}
    </div>
  )
}

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
      <h1
        id="rival-partido"
        className="break-words font-display text-2xl font-black italic leading-tight tracking-tight text-foreground"
      >
        {tenantName}
      </h1>
      <p className="text-lg font-semibold tabular-nums text-foreground">
        {whenLabel(startsAt, now)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <FactPill>{formatLabel(format)}</FactPill>
        <FactPill>{RIVAL_LEVEL_LABELS[level]}</FactPill>
        {hasStamp && <StampBadge />}
        {ended && <FactPill>Jugado</FactPill>}
      </div>
    </section>
  )
}

/**
 * El callejón sin salida DENTRO de una página (partido caído, Mis partidos vacío): el mismo patrón
 * que `PortalResult` de las pantallas completas (círculo con ícono, título de La Previa, una línea
 * y la salida), en chiquito y sin ocupar el alto. Un solo tratamiento para todos los vacíos.
 */
export function RivalDeadEnd({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  actions: ReactNode
}) {
  return (
    <section className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-slate-500/15 ring-8 ring-slate-500/10">
        <Icon className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="mt-2 text-balance font-display text-2xl font-black italic leading-tight tracking-tight text-foreground">
        {title}
      </h2>
      {children && (
        <div className="max-w-xs text-pretty text-base text-muted-foreground">{children}</div>
      )}
      <div className="mt-4 w-full space-y-3">{actions}</div>
    </section>
  )
}

/**
 * "Este partido se cayó." con la salida a "Armar otro". Sin sesión, `/rival/nuevo` manda a
 * `/ingresar`, que por email no crea cuenta: la salida es el tablón, que tiene el ingreso de RIVAL.
 */
export function CanceledCard({ signedIn }: { signedIn: boolean }) {
  return (
    <RivalDeadEnd
      icon={CalendarX}
      title="Este partido se cayó."
      actions={
        signedIn ? (
          <Link href="/rival/nuevo" className={RIVAL_ACTION}>
            <Plus className="size-4" aria-hidden />
            Armar otro
          </Link>
        ) : (
          <Link href="/rival/tablon" className={RIVAL_ACTION}>
            Ver el tablón
          </Link>
        )
      }
    />
  )
}
