'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, CalendarOff, ChevronDown, LandPlot } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { chargeSplit } from '@/components/booking/slot-panel/charge-copy'
import { bookingBadgeVisual, PENDING_CHARGE_BADGE } from '@/lib/booking/slot-visual'
import { rowDisplayName } from '@/lib/dashboard/day-bookings'
import { startLabel, type BoardColumn, type BoardRow } from '@/lib/dashboard/today-board'
import { TONE_BORDER, TONE_TEXT, TONE_TINT } from '@/lib/status-tone'
import { capitalizeFirst, formatArs, relativeTimeEs } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Filas visibles por cancha antes de plegar, SIN contar las de "por cobrar":
 *  esas van siempre a la vista porque son plata que falta y esconder plata
 *  detrás de "Ver N más" es exactamente lo que este tablero viene a evitar. */
const MAX_VISIBLE_ROWS = 4

type Occupancy = { occupied: number; available: number; blocked: number; pct: number }

/**
 * "Turnos de hoy" — el tablero del mostrador. Una columna por cancha, en el
 * mismo orden en que la Grilla dibuja las suyas, con tres tipos de fila:
 *
 *  - **Por cobrar** (terminó y falta plata): borde ámbar, la pastilla "Por
 *    cobrar" y "Falta $X". Van arriba y nunca se pliegan. Ámbar y no rojo: un
 *    turno terminado y sin cobrar es lo normal en la media hora que sigue al
 *    partido, no una alarma ni una deuda (`PENDING_CHARGE_BADGE`).
 *  - **En juego**: la única fila teñida (Von Restorff, MASTER §9): dice cuánto
 *    falta, "Pagado" o el avance de la cobranza.
 *  - **Próximos**: hora, "en N min", nombre y el badge de siempre.
 *
 * Cada fila es UN botón que abre el modal de cobro: nada de links a otra
 * pantalla. El tablero solo muestra y avisa; qué entra en cada bloque lo decide
 * `buildTodayBoard` (función pura, con su propio test).
 *
 * Es presentacional a propósito: el reloj (`nowMs`) y el turno abierto los
 * maneja quien lo monta, así una revalidación no lo desmonta.
 */
export function TodayBoard({
  columns,
  nowMs,
  occupancy,
  dayIsClosed,
  canManageCourts,
  onOpenBooking,
}: {
  columns: BoardColumn[]
  nowMs: number
  occupancy: Occupancy
  /** El día no tiene horarios (feriado, o el día marcado cerrado). */
  dayIsClosed: boolean
  /** Solo el dueño puede activar canchas: al Encargado no se le ofrece un link que rebota. */
  canManageCourts: boolean
  onOpenBooking: (bookingId: string) => void
}) {
  const hasRows = columns.some((c) => c.rows.length > 0)

  return (
    <section aria-labelledby="turnos-titulo" className="card-premium overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="turnos-titulo" className="text-base font-semibold text-foreground">
          Turnos de hoy
        </h2>
        <p className="text-sm tabular-nums text-muted-foreground">
          {occupancyLabel(occupancy, dayIsClosed)}
        </p>
      </header>

      {!hasRows ? (
        dayIsClosed ? (
          <EmptyState
            icon={CalendarOff}
            title="Hoy el complejo está cerrado."
            description="No hay horarios cargados para este día."
            className="rounded-t-none border-0 py-10"
          />
        ) : columns.length === 0 ? (
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
          <EmptyState
            icon={CalendarCheck}
            title="No queda nada por jugar ni por cobrar hoy."
            description="Los turnos que quedaban ya se jugaron y están cobrados."
            className="rounded-t-none border-0 py-10"
          />
        )
      ) : (
        // Separadores por BORDE y no por fondo: en tema oscuro `card-premium` es
        // translúcido (`rgba(255,255,255,0.03)` + backdrop-filter) sobre el
        // shell, así que columnas con `bg-card` sólido se verían como parches
        // opacos dentro de la tarjeta. Cada columna lleva su borde superior e
        // izquierdo y el grid se corre `-mt-px -ml-px`: el `overflow-hidden`
        // de la sección recorta la primera fila y la primera columna de
        // bordes, así que no hace falta saber cuál celda empieza cada fila
        // —que con `auto-fill` no se puede saber en CSS—.
        <div
          className="-ml-px -mt-px grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))' }}
        >
          {columns.map((column) => (
            <CourtColumn
              key={column.courtId}
              column={column}
              nowMs={nowMs}
              onOpenBooking={onOpenBooking}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CourtColumn({
  column,
  nowMs,
  onOpenBooking,
}: {
  column: BoardColumn
  nowMs: number
  onOpenBooking: (bookingId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const unpaid = column.rows.filter((r) => r.kind === 'unpaid')
  const rest = column.rows.filter((r) => r.kind !== 'unpaid')
  const hidden = rest.length - MAX_VISIBLE_ROWS
  const visibleRest = expanded ? rest : rest.slice(0, MAX_VISIBLE_ROWS)
  const visible = [...unpaid, ...visibleRest]

  return (
    <div className="min-w-0 border-l border-t border-border px-3 pb-2.5 pt-3 sm:px-4">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h3 className="truncate text-sm font-semibold text-foreground">{column.courtName}</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {column.offline
            ? 'Pausada'
            : column.rows.length === 0
              ? null
              : column.rows.length === 1
                ? '1 turno'
                : `${column.rows.length} turnos`}
        </span>
      </div>

      {visible.length === 0 ? (
        // Decir "libre" y no dejar la cancha en blanco: una fila vacía se lee
        // como "no cargó", y acá lo vacío es justamente el dato que el dueño
        // usa para ofrecerle el horario a alguien.
        <p className="mt-2.5 px-1 text-sm text-muted-foreground">Libre el resto del día.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1">
          {visible.map((row) => (
            <li key={row.booking.id}>
              <BoardRowButton
                row={row}
                nowMs={nowMs}
                capacity={column.capacity}
                onOpen={() => onOpenBooking(row.booking.id)}
              />
            </li>
          ))}
        </ol>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-0.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? 'Ver menos' : `Ver ${hidden} más`}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  )
}

const ROW_BASE =
  'block min-h-11 w-full rounded-lg border-l-[3px] py-1.5 pl-2.5 pr-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'

function BoardRowButton({
  row,
  nowMs,
  capacity,
  onOpen,
}: {
  row: BoardRow
  nowMs: number
  capacity: number | undefined
  onOpen: () => void
}) {
  const { booking } = row
  const name = rowDisplayName(booking)
  const timeLabel = `${booking.timeStart}–${booking.timeEnd}`
  const pending = typeof booking.pending === 'number' ? booking.pending : 0

  if (row.kind === 'unpaid') {
    const note = chargeSplit(booking, capacity).note
    const endedAgo = relativeTimeEs(new Date(booking.endsAtMs).toISOString(), nowMs)
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={cn(ROW_BASE, TONE_BORDER[PENDING_CHARGE_BADGE.tone], 'hover:bg-accent/50')}
      >
        {/* Hora y estado arriba, como en las filas que vienen. La pastilla reemplaza
            al chip verde "Cobrar": con cuatro turnos terminados eran cuatro verdes
            sólidos gritando a la vez, y la fila entera ya es el botón. */}
        <span className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
            {timeLabel}
          </span>
          <StatusBadge visual={PENDING_CHARGE_BADGE} className="shrink-0" />
        </span>
        {/* El nombre va solo en su renglón: con el monto al lado, en una columna de
            ~230 px se cortaba justo lo que dice a quién hay que cobrarle. */}
        <span className="mt-0.5 block truncate text-sm text-foreground">{name}</span>
        {/* Sin `truncate`: "Pagaron 4 de 10" es justo lo que evita cobrarle dos veces al mismo. */}
        <span className="mt-0.5 block text-xs text-muted-foreground">
          <span
            className={cn(
              'whitespace-nowrap text-sm font-semibold tabular-nums',
              TONE_TEXT[PENDING_CHARGE_BADGE.tone],
            )}
          >
            Falta {formatArs(pending)}
          </span>
          {/* Cada dato entero en su renglón: partir "Terminó hace 22 | min" se lee peor. */}
          <span className="whitespace-nowrap">{` · Terminó ${endedAgo}`}</span>
          {note ? <span className="whitespace-nowrap">{` · ${note}`}</span> : null}
        </span>
      </button>
    )
  }

  const badge = bookingBadgeVisual({
    status: booking.status,
    type: booking.type,
    depositStatus: booking.depositStatus ?? 'not_required',
  })
  const relative = startLabel(booking, nowMs)

  if (row.kind === 'live') {
    // El turno EN CURSO es la única fila teñida del tablero: es el "uno
    // distinto por vista" de Von Restorff (MASTER §9). Teñir también los que
    // vienen dejaría la pantalla sin foco, y apagar los otros para destacarlo
    // rompe AA (§2.4).
    const note = chargeSplit(booking, capacity).note
    const money = note ?? (pending > 0 ? `Falta ${formatArs(pending)}` : 'Pagado')
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={cn(ROW_BASE, TONE_BORDER[badge.tone], TONE_TINT[badge.tone])}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
            {timeLabel}
          </span>
          <span
            className={cn(
              'shrink-0 whitespace-nowrap text-xs font-semibold',
              TONE_TEXT[badge.tone],
            )}
          >
            {capitalizeFirst(relative ?? 'ahora')}
          </span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-foreground">{name}</span>
          <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">
            {booking.type === 'tournament' ? 'Torneo' : money}
          </span>
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(ROW_BASE, TONE_BORDER[badge.tone], 'hover:bg-accent/50')}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
          {timeLabel}
        </span>
        {relative && (
          <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
            {relative}
          </span>
        )}
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">{name}</span>
        <StatusBadge visual={badge} className="shrink-0" />
      </span>
    </button>
  )
}

/**
 * El resumen de ocupación del día, que antes era una tarjeta suelta ("Turnos de
 * hoy"). Vive en el encabezado de este bloque porque el número solo significa
 * algo al lado de las canchas que lo produjeron.
 *
 * Con 0 canchas online (o todo bloqueado) el denominador da 0 pero el numerador
 * puede seguir contando turnos reales: ahí se muestra solo el numerador, para
 * no escribir "N de 0" ni un "0% de ocupación" que engaña.
 */
function occupancyLabel(occupancy: Occupancy, dayIsClosed: boolean): string {
  if (dayIsClosed) return 'Sin horarios para hoy'
  if (occupancy.available === 0) return `${occupancy.occupied} turnos · sin horarios disponibles`
  const blocked = occupancy.blocked > 0 ? ` · ${occupancy.blocked} bloqueados` : ''
  return `${occupancy.occupied} de ${occupancy.available} · ${occupancy.pct}% de ocupación${blocked}`
}
