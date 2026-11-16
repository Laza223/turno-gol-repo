import Link from 'next/link'
import { BadgeCheck, CalendarX, Plus, type LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { formatLabel } from '@/components/public/courtFacets'
import { cn } from '@/lib/utils'
import { RIVAL_LEVEL_LABELS, whenLabel } from '@/modules/rival/rival-display'
import type { RivalLevel } from '@/modules/rival/rival.types'
import { RIVAL_ACTION } from './rival-classes'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import './rival.css'

/** El sello "Reservada en TurnoGol": la etiqueta verde de lugar (`.tag`), no un botón. */
export function StampBadge({ className }: { className?: string }) {
  return (
    <span className={cn('pa-tag gap-1', className)}>
      <BadgeCheck className="size-3.5" aria-hidden />
      Reservada en TurnoGol
    </span>
  )
}

/** Un chip de dato (formato, nivel): la etiqueta neutra (`.tag--rival`), sin color de estado. */
function FactPill({ children }: { children: string }) {
  return <span className="pa-tag ri-tag--neutral">{children}</span>
}

/**
 * La barra del cupo: crece una vez al entrar en pantalla (`.ri-bar`). Decorativa (`aria-hidden`):
 * quien la usa dice "Ya son X de Y" en texto.
 */
export function CupoBar({
  filled,
  capacity,
  className,
}: {
  filled: number
  capacity: number
  className?: string
}) {
  const fill = capacity > 0 ? Math.min(filled, capacity) / capacity : 0
  return (
    <span aria-hidden className={cn('ri-bar', className)}>
      <i style={{ '--fill': fill } as CSSProperties} />
    </span>
  )
}

/** La cabecera del partido (complejo, día y hora, formato, nivel y sello). Sin personas. */
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
    <section aria-labelledby="rival-partido" className="ri-mhead rv-rise">
      <div className="flex flex-wrap items-center gap-2">
        <FactPill>{formatLabel(format)}</FactPill>
        <FactPill>{RIVAL_LEVEL_LABELS[level]}</FactPill>
        {hasStamp && <StampBadge />}
        {ended && <FactPill>Jugado</FactPill>}
      </div>
      <h1 id="rival-partido" className="rv-h1 break-words">
        {tenantName}
      </h1>
      <p className="text-xl font-semibold tabular-nums text-portal-ink">
        {whenLabel(startsAt, now)}
      </p>
    </section>
  )
}

/**
 * El callejón sin salida DENTRO de una página (partido caído, Mis partidos vacío): el vacío de
 * vidrio (`.empty`) con la insignia neutra, una línea y la salida. Un solo tratamiento para todos
 * los vacíos.
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
    <section className="rv-empty glass-painted rv-rise">
      <span className="rv-badge rv-badge--neutral" aria-hidden>
        <Icon className="size-8" />
      </span>
      <h2 className="rv-h2">{title}</h2>
      {children && <div className="rv-sub max-w-[36ch]">{children}</div>}
      <div className="mt-3 grid w-full max-w-sm gap-3">{actions}</div>
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
          <Link href="/rival" className={RIVAL_ACTION}>
            Ver el tablón
          </Link>
        )
      }
    />
  )
}
