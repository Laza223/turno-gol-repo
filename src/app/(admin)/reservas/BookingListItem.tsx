import Link from 'next/link'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { hhmmToMins } from '@/shared/time/operating-day'
import { reservaHasEnded, reservaIsLive } from './status-visual'
import { agendaMoneyCell } from './money-line'
import type { ReservaListRow } from './queries'

// Función aparte, no `Date.now()` directo en el cuerpo del componente:
// react-compiler marca como impura una llamada directa a un builtin conocido
// (Date.now, Math.random) DENTRO de un componente, pero no puede saberlo de
// una función común — mismo patrón que `mis-reservas/page.tsx`. Server
// Component: no hace falta un reloj reactivo, `Date.now()` en el server alcanza.
function nowMs(): number {
  return Date.now()
}

function clientName(booking: Pick<ReservaListRow, 'playerName' | 'guestName' | 'type'>): string {
  if (booking.type === 'block') return 'Bloqueo'
  return booking.playerName ?? booking.guestName ?? 'Sin nombre'
}

/**
 * Duración del turno en minutos, sobre el eje continuo de `hhmmToMins` (mismo
 * helper que usa `operating-day.ts` para todo lo demás — nunca reimplementar
 * esta aritmética). Suma 24h cuando el fin "da la vuelta" (`'24:00'`, o un
 * evento que cruza la medianoche en un complejo `closes_next_day`).
 */
function durationMinutes(timeStart: string, timeEnd: string): number {
  const start = hhmmToMins(timeStart)
  const end = hhmmToMins(timeEnd)
  return end > start ? end - start : end + 24 * 60 - start
}

/**
 * Chip neutro de "qué es" el turno — SOLO si no es un turno común de 60 min.
 * "Online" queda afuera a propósito: no hay forma de saberlo sin sumar otra
 * columna al SELECT (`created_by_staff` NULL no alcanza — también lo tienen
 * los turnos fijos de abonado nacidos del worker, ver el comentario en
 * `booking.service.ts`), y el presupuesto de este cambio solo admite `phone`.
 */
function typeChip(booking: Pick<ReservaListRow, 'type' | 'timeStart' | 'timeEnd'>): string | null {
  if (booking.type === 'fixed') return 'Fijo'
  if (booking.type === 'spontaneous') {
    const minutes = durationMinutes(booking.timeStart, booking.timeEnd)
    if (minutes > SLOT_DURATION_MINUTES) return `Evento · ${Math.round(minutes / 60)} h`
  }
  return null
}

function buildAriaLabel({
  timeRange,
  courtName,
  name,
  live,
  money,
}: {
  timeRange: string
  courtName: string
  name: string
  live: boolean
  money: { text: string }
}): string {
  return [`Turno ${timeRange}`, courtName, name, live ? 'se juega' : null, money.text]
    .filter(Boolean)
    .join(', ')
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
      Se juega
    </span>
  )
}

function TypeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  )
}

/**
 * Fila de la Agenda (`/reservas`). Una sola lectura de la plata (ver
 * `agendaMoneyCell`): nada de badge de estado + píldora "No cobrado" +
 * segunda línea de seña apiladas, como tenía el listado por pestañas. La fila
 * entera es un link a `/reservas/[id]`.
 *
 * Angosto (teléfono): dos renglones — hora · cancha · "Se juega" · plata
 * arriba, nombre · chip de tipo abajo. Ancho (`lg:`): columnas fijas, con el
 * teléfono como segunda línea del nombre.
 */
export function BookingListItem({ booking }: { booking: ReservaListRow }) {
  const ended = reservaHasEnded(booking, nowMs())
  const live = reservaIsLive(booking, nowMs())
  const isBlock = booking.type === 'block'
  const name = clientName(booking)
  const timeRange = `${formatTime(booking.timeStart)}–${formatTime(booking.timeEnd)}`
  const money = agendaMoneyCell(booking, ended)
  const chip = typeChip(booking)

  const ariaLabel = buildAriaLabel({ timeRange, courtName: booking.courtName, name, live, money })

  return (
    <li>
      <article
        aria-label={ariaLabel}
        className="group relative flex flex-col gap-1 px-3 py-2 transition-colors hover:bg-accent/50 lg:h-12 lg:flex-row lg:items-center lg:gap-3 lg:py-0"
      >
        <Link
          href={`/reservas/${booking.id}`}
          aria-label={ariaLabel}
          className="absolute inset-0 z-0 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />

        {/* Angosto: hora · cancha · en juego …… plata. */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
          <span className="font-medium tabular-nums text-foreground">
            {formatTime(booking.timeStart)}
          </span>
          <span className="truncate">· {booking.courtName}</span>
          {live && <LiveDot />}
          <span className={cn('ml-auto shrink-0 tabular-nums', TONE_TEXT[money.tone])}>
            {money.text}
          </span>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2 lg:hidden">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-foreground">
            {isBlock && <Ban aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {name}
          </span>
          {chip && <TypeChip label={chip} />}
        </div>

        {/* Ancho: columnas fijas. */}
        <div className="hidden w-24 shrink-0 flex-col justify-center lg:flex">
          <span className="text-sm tabular-nums text-foreground">{timeRange}</span>
          {live && <LiveDot />}
        </div>
        <div className="hidden w-28 shrink-0 truncate text-sm text-muted-foreground lg:block">
          {booking.courtName}
        </div>
        <div className="hidden min-w-0 flex-1 lg:block">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
            {isBlock && <Ban aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {name}
          </span>
          {!isBlock && booking.phone && (
            <div className="truncate text-xs text-muted-foreground">{booking.phone}</div>
          )}
        </div>
        <div className="hidden w-28 shrink-0 lg:block">{chip && <TypeChip label={chip} />}</div>
        <div
          className={cn(
            'hidden w-32 shrink-0 text-right text-sm tabular-nums lg:block',
            TONE_TEXT[money.tone],
          )}
        >
          {money.text}
        </div>
      </article>
    </li>
  )
}
