/**
 * Helpers puros del dashboard admin (pages/dashboard.md §9) — sin imports de DB
 * para que el unit test no arrastre el cliente de Supabase.
 *
 * Convención de tiempos: minutos "del día operativo". Con `closesNextDay`, un
 * horario anterior a la apertura pertenece a la madrugada de la noche en curso
 * y se corre +1440, así '01:00' ordena después de '23:00' y '24:00' (medianoche
 * como fin de slot, ver operating-day.ts) compara bien.
 */
import { DAY_KEYS, generateTimeSlots } from '@/lib/booking/grid-cells'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  BookingStatus,
  BookingType,
  DepositStatus,
} from '@/modules/bookings/booking.types'

export interface DayBookingRow {
  id: string
  courtName: string
  /** 'HH:MM' */
  timeStart: string
  /** 'HH:MM' — puede ser '24:00' (slot que termina a medianoche). */
  timeEnd: string
  status: BookingStatus
  type: BookingType
  depositStatus: DepositStatus
  depositAmount: number
  guestName: string | null
  playerFirstName: string | null
  playerLastName: string | null
  priceSnapshot: number
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

/** Minutos normalizados al día operativo (§9): antes de la apertura → +1440. */
function operatingMins(hhmm: string, openMins: number, closesNextDay: boolean): number {
  const mins = timeToMins(hhmm)
  return closesNextDay && mins < openMins ? mins + 24 * 60 : mins
}

/**
 * Reservas de hoy que faltan jugar (o están en curso): sin bloqueos, solo
 * `confirmed`/`pending_payment`, fin posterior a ahora. Orden cronológico
 * operativo (la madrugada de la noche va al final, como en la grilla).
 */
export function upcomingForDay(
  rows: DayBookingRow[],
  nowHhmm: string,
  openHhmm: string,
  closesNextDay: boolean,
): DayBookingRow[] {
  const openMins = timeToMins(openHhmm)
  const nowMins = operatingMins(nowHhmm, openMins, closesNextDay)
  return rows
    .filter(
      (r) =>
        r.type !== 'block' &&
        (r.status === 'confirmed' || r.status === 'pending_payment') &&
        operatingMins(r.timeEnd, openMins, closesNextDay) > nowMins,
    )
    .sort(
      (a, b) =>
        operatingMins(a.timeStart, openMins, closesNextDay) -
        operatingMins(b.timeStart, openMins, closesNextDay),
    )
}

/**
 * Etiqueta relativa §8.3 para la fila: 'ahora' (en curso), 'en X min' (arranca
 * dentro de la hora), o null (más lejos — alcanza con la hora absoluta).
 */
export function relativeStartLabel(
  row: Pick<DayBookingRow, 'timeStart' | 'timeEnd'>,
  nowHhmm: string,
  openHhmm: string,
  closesNextDay: boolean,
): string | null {
  const openMins = timeToMins(openHhmm)
  const now = operatingMins(nowHhmm, openMins, closesNextDay)
  const start = operatingMins(row.timeStart, openMins, closesNextDay)
  const end = operatingMins(row.timeEnd, openMins, closesNextDay)
  if (start <= now && now < end) return 'ahora'
  const diff = start - now
  if (diff > 0 && diff <= 60) return `en ${diff} min`
  return null
}

/** Cuántas se jugaron hoy (para el vacío "no quedan turnos por jugar"). */
export function playedCount(rows: DayBookingRow[]): number {
  return rows.filter((r) => r.type !== 'block' && r.status === 'completed').length
}

/** Señas esperando pago hoy: cantidad + monto de señas por acreditar. */
export function pendingDeposits(rows: DayBookingRow[]): { count: number; amountCents: number } {
  let count = 0
  let amountCents = 0
  for (const row of rows) {
    if (row.type === 'block' || row.status !== 'pending_payment') continue
    count++
    amountCents += row.depositAmount
  }
  return { count, amountCents }
}

/** Nombre a mostrar: guest > jugador > fallback. (Duplicado consciente de
 * BookingCard.bookingDisplayName: aquel vive en un módulo 'use client' y un
 * Server Component no puede importarlo sin romper en runtime.) */
export function rowDisplayName(
  row: Pick<DayBookingRow, 'guestName' | 'playerFirstName' | 'playerLastName'>,
): string {
  if (row.guestName) return row.guestName
  const full = [row.playerFirstName, row.playerLastName].filter(Boolean).join(' ')
  return full || 'Sin nombre'
}

export type BookingBadgeKind = 'esperando' | 'senada' | 'abonado' | 'confirmada'

/** Mismo orden de prioridad que la grilla (pages/grilla.md §2). */
export function badgeKindForRow(
  row: Pick<DayBookingRow, 'status' | 'type' | 'depositStatus'>,
): BookingBadgeKind {
  if (row.status === 'pending_payment') return 'esperando'
  if (row.depositStatus === 'paid' || row.depositStatus === 'captured') return 'senada'
  if (row.type === 'fixed') return 'abonado'
  return 'confirmada'
}
