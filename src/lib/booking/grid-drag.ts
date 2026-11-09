import { endLabelFromMins, hhmmToMins, startLabelFromMins } from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import type { CellState, GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'

/**
 * Lógica pura de "mover un turno arrastrándolo" en la grilla. El gesto vive en
 * `useGridDrag`; acá solo se decide a dónde se puede soltar y qué horario le
 * toca al destino. La validación real sigue siendo `rescheduleBooking` (server):
 * esto solo evita ofrecer huecos que el server va a rechazar.
 */

export type DragTarget = {
  courtId: string
  courtIndex: number
  /** Índice en `visibleSlots`: la fila del CSS grid (más `rowOffset`). */
  row: number
  slotTime: string
  /** ¿Se puede soltar acá? Falso = hueco ocupado, pasado, cancha pausada o el propio lugar. */
  valid: boolean
}

/**
 * Inicio y fin del slot de 60 min que arranca en `slotTime`. Sale del eje
 * continuo del día operativo (`slots[0]` es la apertura) con los helpers de
 * `operating-day.ts`: así la hora de 23:00 termina en `'24:00'` y las de
 * madrugada de un complejo que cierra pasada la medianoche envuelven bien.
 */
export function slotRange(
  slots: string[],
  slotTime: string,
): { timeStart: string; timeEnd: string } | null {
  const idx = slots.indexOf(slotTime)
  if (idx < 0) return null
  const startMins = hhmmToMins(slots[0]!) + idx * SLOT_DURATION_MINUTES
  return {
    timeStart: startLabelFromMins(startMins),
    timeEnd: endLabelFromMins(startMins + SLOT_DURATION_MINUTES),
  }
}

/** Traduce la celda bajo el puntero (`data-col`/`data-row`) al destino del arrastre. */
export function resolveDropTarget(
  pos: { col: number; row: number },
  ctx: {
    courts: CourtRow[]
    visibleSlots: string[]
    cells: Map<string, CellState>
    isSlotPast: (slotTime: string) => boolean
  },
): DragTarget | null {
  const court = ctx.courts[pos.col]
  const slotTime = ctx.visibleSlots[pos.row]
  if (!court || !slotTime) return null
  const free = ctx.cells.get(`${court.id}:${slotTime}`)?.kind === 'free'
  return {
    courtId: court.id,
    courtIndex: pos.col,
    row: pos.row,
    slotTime,
    valid: free && court.status === 'online' && !ctx.isSlotPast(slotTime),
  }
}

/**
 * ¿Este turno se puede agarrar? `canReschedule` es el gate de `slotGates`
 * (tipo, estado, duración de 60 min, acciones inyectadas). Además: que no haya
 * empezado y que no tenga una seña en curso (`deposit_pending`, que el server
 * rechaza: hay un link de pago vivo con el monto ya cotizado).
 */
export function isDraggableBooking(
  booking: Pick<GridBooking, 'depositStatus'>,
  opts: { canReschedule: boolean; started: boolean },
): boolean {
  return opts.canReschedule && !opts.started && booking.depositStatus !== 'pending'
}
