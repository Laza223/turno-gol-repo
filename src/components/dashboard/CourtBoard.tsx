'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { CalendarOff, Check, ChevronRight, LandPlot } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { MetaLine } from '@/components/ui/meta-line'
import { chargeSplit } from '@/components/booking/slot-panel/charge-copy'
import { bookingBadgeVisual } from '@/lib/booking/slot-visual'
import { rowDisplayName } from '@/lib/dashboard/day-bookings'
import {
  startLabel,
  type BoardBooking,
  type CourtBoard as CourtBoardData,
  type CourtTile,
} from '@/lib/dashboard/today-board'
import { formatArs, relativeTimeEs } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

export type QueueCourt = {
  id: string
  name: string
  status: 'online' | 'offline'
  /** Jugadores que entran (`format × 2`): sin esto no se cuenta "Pagaron 4 de 10". */
  capacity?: number
}

/** Un turno de un día anterior, con el día ya escrito para la pantalla ("ayer", "lun 22 de septiembre"). */
export type EarlierBooking = BoardBooking & { dayLabel: string }

/**
 * "Turnos de hoy": una fila por cancha, con UN turno cada una (pedido del
 * dueño, 2026-09-25; eligió este diseño entre variantes el mismo día). Es una
 * pantalla de acción: lo que hay que hacer ahora se ve solo.
 *
 * - **Cobrar ahora** — el turno terminó y no se cobró: la fila en rojo, con
 *   "Cobrar $X" y el punto que late. Es plata que se va con el grupo que está saliendo.
 * - **Se juega** — cuánto falta, lo que falta cobrar o "Pagado", y el reloj en verde.
 * - **Próximo** — cuándo empieza y a nombre de quién.
 *
 * Qué turno muestra cada cancha lo decide `buildCourtBoard` (función pura, con
 * su test). Cada fila es UN botón que abre el modal de cobro.
 */
export function CourtBoard({
  board,
  courts,
  nowMs,
  dayIsClosed,
  canManageCourts,
  onOpenBooking,
}: {
  board: CourtBoardData
  courts: QueueCourt[]
  nowMs: number
  /** El día no tiene horarios (feriado, o el día marcado cerrado). */
  dayIsClosed: boolean
  /** Solo el dueño puede activar canchas: al Encargado no se le ofrece un link que rebota. */
  canManageCourts: boolean
  onOpenBooking: (bookingId: string) => void
}) {
  const courtOf = courtLookup(courts)
  const late = board.lateCount > 0
  const anyStarted = board.queue.anyStarted

  return (
    <section
      aria-labelledby="turnos-titulo"
      className="card-premium @container/board overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3.5 sm:px-5">
        <h2 id="turnos-titulo" className="text-base font-semibold text-foreground">
          Turnos de hoy
        </h2>
        {late ? (
          <p className={cn('text-sm font-semibold tabular-nums', TONE_TEXT.destructive)}>
            {board.lateCount === 1 ? '1 sin cobrar' : `${board.lateCount} sin cobrar`} ·{' '}
            {formatArs(board.lateCents)}
          </p>
        ) : anyStarted && board.queue.now.length === 0 ? (
          <p
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium',
              TONE_TEXT.success,
            )}
          >
            <Check aria-hidden className="h-4 w-4" />
            Todo cobrado
          </p>
        ) : null}
      </header>

      {dayIsClosed && board.queue.now.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="Hoy el complejo está cerrado."
          description="No hay horarios cargados para este día."
          className="rounded-t-none border-0 py-10"
        />
      ) : board.tiles.length === 0 ? (
        <EmptyState
          icon={LandPlot}
          title="No hay ninguna cancha en servicio."
          description={
            canManageCourts
              ? 'Mientras estén todas pausadas no se puede reservar nada.'
              : 'Mientras estén todas pausadas no se puede reservar nada. Pedile al dueño que active una.'
          }
          action={
            canManageCourts ? (
              <Link
                href="/canchas"
                className="flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
              >
                Ir a Canchas
              </Link>
            ) : undefined
          }
          className="rounded-t-none border-0 py-10"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-2 p-3 @min-[40rem]/board:grid-cols-2 sm:p-4">
          {board.tiles.map((tile) => (
            <li key={tile.courtId} className="@container/row flex">
              <CourtRow
                tile={tile}
                court={courtOf(tile.courtId)}
                nowMs={nowMs}
                onOpenBooking={onOpenBooking}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Una fila por cancha: la cancha, el turno, la plata y abajo el reloj del turno
 * (se llena en verde mientras se juega; rojo y lleno si terminó sin cobrarse).
 * Con poco ancho (la notebook del mostrador, con Vender al lado) el nombre de la
 * cancha sube arriba del turno para que "Cobrar $X" no aplaste el nombre.
 */
const ROW = cn(
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border px-3.5 pt-3 pb-2.5 text-left',
  "[grid-template-areas:'court_pay'_'main_pay'_'clock_clock']",
  "@min-[25rem]/row:grid-cols-[5.5rem_minmax(0,1fr)_auto] @min-[25rem]/row:[grid-template-areas:'court_main_pay'_'clock_clock_clock']",
)

function CourtRow({
  tile,
  court,
  nowMs,
  onOpenBooking,
}: {
  tile: CourtTile
  court: QueueCourt | undefined
  nowMs: number
  onOpenBooking: (bookingId: string) => void
}) {
  const courtName = court?.name ?? 'Cancha'
  const focus = tile.focus

  if (!focus) {
    return (
      <div className="grid w-full grid-cols-1 content-center items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-border px-3.5 py-3 @min-[25rem]/row:grid-cols-[5.5rem_minmax(0,1fr)]">
        <span className="min-w-0 truncate text-sm font-semibold text-muted-foreground">
          {courtName}
        </span>
        <p className="text-sm text-muted-foreground">Sin más turnos hoy</p>
      </div>
    )
  }

  const { booking, kind } = focus
  const due = kind === 'due'
  const pending = booking.pending ?? 0
  const note = chargeSplit(booking, court?.capacity).note
  const more =
    tile.moreDue > 0
      ? tile.moreDue === 1
        ? '+1 más por cobrar'
        : `+${tile.moreDue} más por cobrar`
      : null

  let when: string
  let badge: string | null = null
  let pay: ReactNode = null
  if (due) {
    when = `Terminó ${relativeTimeEs(new Date(booking.endsAtMs).toISOString(), nowMs)}`
    pay = <ChargeNowButton cents={pending} />
  } else if (kind === 'live') {
    const minutes = Math.ceil((booking.endsAtMs - nowMs) / 60_000)
    when = minutes <= 60 ? `Termina en ${minutes} min` : `Termina a las ${booking.timeEnd}`
    if (pending > 0) pay = <Amount cents={pending} />
  } else {
    const relative = startLabel(booking, nowMs)
    when = relative ? `Empieza ${relative}` : `Empieza a las ${booking.timeStart}`
    const visual = bookingBadgeVisual({
      status: booking.status,
      type: booking.type,
      depositStatus: booking.depositStatus ?? 'not_required',
    })
    if (visual.key !== 'confirmed') badge = visual.label
  }
  // Pagado entero (pedido del dueño, 2026-09-25): la fila en verde, igual que el
  // rojo de lo que hay que cobrar. Un torneo no se cobra por turno: sin color.
  const paid = !due && pending === 0 && booking.type !== 'tournament'
  if (paid) pay = <span className={cn('text-sm font-semibold', TONE_TEXT.success)}>Pagado</span>

  const name =
    booking.type === 'tournament' && !booking.guestName ? 'Torneo' : rowDisplayName(booking)
  const played = Math.min(
    1,
    Math.max(0, (nowMs - booking.startsAtMs) / (booking.endsAtMs - booking.startsAtMs)),
  )

  return (
    <button
      type="button"
      onClick={() => onOpenBooking(booking.id)}
      aria-haspopup="dialog"
      className={cn(
        ROW,
        'transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        due
          ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10 dark:bg-destructive/10 dark:hover:bg-destructive/15'
          : paid
            ? 'border-success/40 bg-success/5 hover:bg-success/10 dark:bg-success/10 dark:hover:bg-success/15'
            : 'border-border hover:bg-accent/50',
      )}
    >
      <span className="min-w-0 truncate text-sm font-semibold text-foreground [grid-area:court]">
        {courtName}
      </span>
      <span className="min-w-0 [grid-area:main]">
        <span className="block truncate text-[15px] font-medium text-foreground">{name}</span>
        <MetaLine
          className="text-xs tabular-nums text-muted-foreground"
          parts={[
            due ? <span className={cn('font-medium', TONE_TEXT.destructive)}>{when}</span> : when,
            badge,
            note,
            more,
          ]}
        />
      </span>
      <span className="text-right [grid-area:pay]">{pay}</span>
      <span className="mt-1.5 flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground [grid-area:clock]">
        <span className="w-9 shrink-0">{booking.timeStart}</span>
        <span
          aria-hidden
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted dark:bg-white/10"
        >
          <span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              due ? 'bg-destructive' : 'bg-success',
            )}
            style={{ width: `${Math.round(played * 100)}%` }}
          />
        </span>
        <span className="w-9 shrink-0 text-right">{booking.timeEnd}</span>
      </span>
    </button>
  )
}

function Amount({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap font-display text-base font-semibold tabular-nums text-foreground',
        className,
      )}
    >
      {formatArs(cents)}
    </span>
  )
}

/**
 * "Cobrar $X" con un punto que late: lo único que se mueve en Hoy, y solo
 * mientras haya un turno jugado sin cobrar (pedido del dueño, 2026-09-25). Quien
 * pidió menos movimiento en su sistema ve el punto quieto. Parece un botón pero es
 * parte de la fila, que es el botón.
 */
function ChargeNowButton({ cents }: { cents: number }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-white">
      <span aria-hidden className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      Cobrar <span className="font-display tabular-nums">{formatArs(cents)}</span>
    </span>
  )
}

/**
 * Lo que se jugó en días anteriores y nadie cobró: UN renglón con el total, no
 * una lista (Hoy es una pantalla de acción; una lista larga de atrasados la
 * convertía en otra cosa). "Ver y cobrar" abre la lista en un diálogo y cada
 * turno se cobra con el mismo modal que los de hoy.
 */
export function EarlierUnpaidBanner({
  bookings,
  count,
  pendingCents,
  courts,
  onOpenBooking,
}: {
  /** Los más recientes primero, hasta el tope que cargó la página. */
  bookings: EarlierBooking[]
  /** Todos los turnos no cobrados de la ventana, no solo los cargados. */
  count: number
  pendingCents: number
  courts: QueueCourt[]
  onOpenBooking: (bookingId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const courtOf = courtLookup(courts)
  const notLoaded = count - bookings.length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="card-premium flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
      >
        <span className="text-sm text-foreground">
          <span className="font-semibold">
            {count === 1 ? '1 turno no cobrado' : `${count} turnos no cobrados`}
          </span>{' '}
          <span className="text-muted-foreground">de días anteriores</span> ·{' '}
          <span className={cn('font-semibold tabular-nums', TONE_TEXT.destructive)}>
            {formatArs(pendingCents)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Ver y cobrar
          <ChevronRight aria-hidden className="h-4 w-4" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl grid-cols-1 gap-0 p-0">
          <div className="border-b border-border p-5 pr-14">
            <DialogTitle className="font-display text-lg leading-tight">
              Turnos no cobrados
            </DialogTitle>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Se jugaron en días anteriores y no se anotó el cobro. Si nadie lo anota, a las 24 h de
              terminado se da por cobrado en efectivo.
            </p>
          </div>
          <ol className="divide-y divide-border">
            {bookings.map((booking) => {
              const court = courtOf(booking.courtId)
              return (
                <li key={booking.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onOpenBooking(booking.id)
                    }}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {rowDisplayName(booking)}
                      </span>
                      <MetaLine
                        className="mt-0.5 text-xs tabular-nums text-muted-foreground"
                        parts={[
                          booking.dayLabel,
                          court?.name,
                          `${booking.timeStart}–${booking.timeEnd}`,
                          chargeSplit(booking, court?.capacity).note,
                        ]}
                      />
                    </span>
                    <Amount cents={booking.pending ?? 0} className={TONE_TEXT.destructive} />
                  </button>
                </li>
              )
            })}
          </ol>
          {notLoaded > 0 && (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              {notLoaded === 1 ? 'Queda 1 más viejo' : `Quedan ${notLoaded} más viejos`}: están en{' '}
              <Link
                href="/caja/cuentas"
                className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Caja › Cuentas
              </Link>
              .
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function courtLookup(courts: QueueCourt[]) {
  const byId = new Map(courts.map((c) => [c.id, c]))
  return (courtId: string) => byId.get(courtId)
}
