import type {
  BookingStatus,
  BookingType,
  DepositStatus,
  PaymentMethodValue,
} from '@/modules/bookings/booking.types'
import type { CourtRow } from '@/modules/courts/court.types'
import { effectiveCloseMins } from '@/shared/time/operating-day'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GridBooking = {
  id: string
  courtId: string
  date: string
  timeStart: string
  timeEnd: string
  status: BookingStatus
  type: BookingType
  guestName: string | null
  playerFirstName: string | null
  playerLastName: string | null
  priceSnapshot: number
  // Detalle de pago para el popover de la grilla. Opcionales: el payload
  // Realtime y fixtures viejas pueden no traerlos; el popover degrada a "—".
  paymentMethod?: PaymentMethodValue | null
  depositStatus?: DepositStatus | null
  depositAmount?: number | null
}

export type CellState =
  | { kind: 'free' }
  | { kind: 'booking'; booking: GridBooking; rowSpan: number }
  | { kind: 'skip' }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lunes ISO de la semana que contiene a `dateStr` (la semana arranca lunes). */
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  return addDays(dateStr, -((d.getUTCDay() + 6) % 7))
}

export function generateTimeSlots(
  openHhmm: string,
  closeHhmm: string,
  closesNextDay = false,
): string[] {
  const openMins = timeToMins(openHhmm)
  // Día operativo: con closesNextDay un cierre post-medianoche (02:00) corre a
  // 26:00, así el loop emite ...23:00, 00:00, 01:00 EN ORDEN (las madrugadas
  // quedan al final de la grilla, no al principio). minsToTime envuelve %24.
  const closeMins = effectiveCloseMins(openHhmm, closeHhmm, closesNextDay)
  const slots: string[] = []
  for (let t = openMins; t < closeMins; t += 60) {
    slots.push(minsToTime(t))
  }
  return slots
}

// ---------------------------------------------------------------------------
// countCollapsibleLeading — madrugada muerta (pages/grilla.md §5)
// ---------------------------------------------------------------------------

/**
 * Cuántos slots INICIALES se pueden colapsar en la banda "Sin actividad":
 * la corrida inicial de slots pasados donde TODAS las canchas están libres.
 *
 * - El slot en curso (empezado pero no terminado) nunca se colapsa: si la
 *   corrida termina porque el siguiente slot todavía no es pasado, el último
 *   de la corrida es el que está transcurriendo → queda visible.
 * - Un slot pasado con reserva (Jugada/Ausente/bloqueo) corta la corrida:
 *   lo pendiente de revisión no se esconde.
 * - Mínimo 2 filas para que la banda pague su propio alto; nunca se colapsa
 *   el día entero.
 */
export function countCollapsibleLeading(
  slots: string[],
  courts: Pick<CourtRow, 'id'>[],
  cells: Map<string, CellState>,
  isPast: (slotTime: string) => boolean,
): number {
  let run = 0
  for (const slot of slots) {
    if (!isPast(slot)) break
    const allFree = courts.every((c) => cells.get(`${c.id}:${slot}`)?.kind === 'free')
    if (!allFree) break
    run++
  }
  if (run === 0) return 0

  const nextIsPast = run < slots.length && isPast(slots[run]!)
  const collapsible = nextIsPast ? run : run - 1

  if (collapsible < 2) return 0
  return Math.min(collapsible, slots.length - 1)
}

// ---------------------------------------------------------------------------
// Index builder — O(N) single pass; key = `${courtId}:${HH:MM}`
// ---------------------------------------------------------------------------

export function buildBookingsIndex(bookings: GridBooking[]): Map<string, GridBooking> {
  const index = new Map<string, GridBooking>()
  for (const b of bookings) {
    const key = `${b.courtId}:${b.timeStart.slice(0, 5)}`
    if (!index.has(key)) index.set(key, b)
  }
  return index
}

// ---------------------------------------------------------------------------
// computeCells — O(slots × courts) with O(1) lookup via index
// ---------------------------------------------------------------------------

export function computeCells(
  slots: string[],
  courts: CourtRow[],
  bookingsByKey: Map<string, GridBooking>,
): Map<string, CellState> {
  const cells = new Map<string, CellState>()

  for (const court of courts) {
    const coveredSlots = new Set<number>()

    for (let si = 0; si < slots.length; si++) {
      const slotTime = slots[si]!
      const key = `${court.id}:${slotTime}`

      if (coveredSlots.has(si)) {
        cells.set(key, { kind: 'skip' })
        continue
      }

      const candidate = bookingsByKey.get(`${court.id}:${slotTime}`)
      const booking =
        candidate !== undefined &&
        (candidate.status === 'confirmed' ||
          candidate.status === 'pending_payment' ||
          candidate.status === 'completed' ||
          candidate.status === 'no_show' ||
          candidate.type === 'block')
          ? candidate
          : undefined

      if (booking) {
        const startMins = timeToMins(booking.timeStart.slice(0, 5))
        const endMins = timeToMins(booking.timeEnd.slice(0, 5))
        const durationMins = (endMins === 0 ? 24 * 60 : endMins) - startMins
        const rowSpan = Math.max(1, Math.round(durationMins / 60))
        cells.set(key, { kind: 'booking', booking, rowSpan })
        for (let j = si + 1; j < si + rowSpan; j++) {
          coveredSlots.add(j)
        }
      } else {
        cells.set(key, { kind: 'free' })
      }
    }
  }

  return cells
}
