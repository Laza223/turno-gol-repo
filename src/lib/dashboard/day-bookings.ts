/**
 * Helpers puros del dashboard admin (pages/dashboard.md §9) — sin imports de DB
 * para que el unit test no arrastre el cliente de Supabase.
 *
 * `slotHours` tolera rangos que cruzan medianoche y '24:00' como fin de slot (ver
 * operating-day.ts). Qué turno terminó y cuál sigue lo decide `today-board.ts`
 * con los instantes físicos del turno, no con aritmética de strings de hora.
 */
import { DAY_KEYS, generateTimeSlots } from '@/lib/booking/grid-cells'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { BookingType } from '@/modules/bookings/booking.types'

/** Lo que la ocupación necesita saber de un turno del día. */
export interface DayBookingRow {
  /** 'HH:MM' */
  timeStart: string
  /** 'HH:MM' — puede ser '24:00' (slot que termina a medianoche). */
  timeEnd: string
  type: BookingType
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Duración en horas; tolera rangos que cruzan medianoche (end <= start → +24h). */
export function slotHours(timeStart: string, timeEnd: string): number {
  const start = timeToMins(timeStart)
  let end = timeToMins(timeEnd)
  if (end <= start) end += 24 * 60
  return (end - start) / 60
}

/**
 * Slots de 60' del día ART `dateStr` según horarios del tenant. `[]` si el día
 * está cerrado (closed_dates, día marcado closed, o rango inválido sin flag).
 */
export function daySlotsFor(
  dateStr: string,
  openingHours: OpeningHours,
  closedDates: string[],
  closesNextDay: boolean,
): string[] {
  if (closedDates.includes(dateStr)) return []
  const dayKey = DAY_KEYS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()]!
  const day = openingHours[dayKey]
  if (!day || day.closed) return []
  return generateTimeSlots(day.open, day.close, closesNextDay)
}

export interface DayOccupancy {
  /** Horas reservadas (sin bloqueos). */
  occupied: number
  /** Horas ofrecidas: slots × canchas online − horas bloqueadas. */
  available: number
  /** Horas bloqueadas (type='block'). */
  blocked: number
  /** 0–100, redondeado; 0 si no hay oferta. */
  pct: number
}

export function occupancyForDay(
  rows: DayBookingRow[],
  slotsCount: number,
  courtsOnline: number,
): DayOccupancy {
  let occupied = 0
  let blocked = 0
  for (const row of rows) {
    const hours = slotHours(row.timeStart, row.timeEnd)
    if (row.type === 'block') blocked += hours
    else occupied += hours
  }
  const available = Math.max(0, slotsCount * courtsOnline - blocked)
  const pct = available > 0 ? Math.round((occupied / available) * 100) : 0
  return { occupied, available, blocked, pct }
}

/** Nombre a mostrar: guest > jugador > fallback. (Duplicado consciente de
 * BookingCard.bookingDisplayName: aquel vive en un módulo 'use client' y un
 * Server Component no puede importarlo sin romper en runtime.) */
export function rowDisplayName(row: {
  guestName: string | null
  playerFirstName: string | null
  playerLastName: string | null
}): string {
  if (row.guestName) return row.guestName
  const full = [row.playerFirstName, row.playerLastName].filter(Boolean).join(' ')
  return full || 'Sin nombre'
}
