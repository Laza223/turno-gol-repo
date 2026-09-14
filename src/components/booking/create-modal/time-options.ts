import type { GridBooking } from '@/lib/booking/grid-cells'
import {
  END_OF_DAY_MINS,
  endLabelFromMins,
  hhmmToMins,
  startLabelFromMins,
} from '@/shared/time/operating-day'

/**
 * Helpers puros del modal de alta: qué horarios ofrecer (inicio libre, fin
 * topeado) a partir de los slots del día y las reservas YA cargadas de esa
 * cancha — sin pedirle nada nuevo al server (pages/grilla.md §3bis).
 *
 * La duplica un fragmento chico de `computeCells` (qué estados "ocupan" la
 * grilla) a propósito: `src/lib/booking/grid-cells.ts` es de otro agente en
 * paralelo (ver el contrato) y este archivo tiene que quedar puro y testeable
 * sin esperar ese archivo.
 */

/** Nombre completo en minúscula, índice = `Date#getUTCDay()` (0 = domingo). */
export const WEEKDAY_NAMES_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

/** Día de la semana (0=domingo) de un `YYYY-MM-DD`, leído como día calendario. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay()
}

export type OccupancyBooking = Pick<GridBooking, 'timeStart' | 'timeEnd' | 'status' | 'type'>

/** Mismo criterio que `computeCells`: qué reservas ocupan la grilla (torneo y bloqueo incluidos). */
function occupiesGrid(b: OccupancyBooking): boolean {
  return (
    b.status === 'confirmed' ||
    b.status === 'pending_payment' ||
    b.status === 'completed' ||
    b.status === 'no_show' ||
    b.type === 'block'
  )
}

/** Set de labels HH:MM (start-of-slot) cubiertos por alguna reserva ocupante. */
function occupiedSlotLabels(bookings: OccupancyBooking[]): Set<string> {
  const covered = new Set<string>()
  for (const b of bookings) {
    if (!occupiesGrid(b)) continue
    const start = hhmmToMins(b.timeStart.slice(0, 5))
    const rawEnd = hhmmToMins(b.timeEnd.slice(0, 5))
    const end = rawEnd <= start ? rawEnd + END_OF_DAY_MINS : rawEnd
    for (let m = start; m < end; m += 60) covered.add(startLabelFromMins(m))
  }
  return covered
}

/** Horarios de inicio LIBRES de esa cancha ese día (excluye pasados y ocupados). */
export function freeStartTimes(params: {
  slots: string[]
  courtBookings: OccupancyBooking[]
  isPast: (slotTime: string) => boolean
}): string[] {
  const occupied = occupiedSlotLabels(params.courtBookings)
  return params.slots.filter((s) => !params.isPast(s) && !occupied.has(s))
}

/**
 * Fin máximo para un turno que arranca en `startTime`: se topea en la próxima
 * reserva de esa cancha, en el cierre del día, o en las 24:00 — una fila nunca
 * las cruza (chk_time_valid, decisión 2026-09-14). Un slot post-medianoche
 * (`closesNextDay`) se detecta porque el label "retrocede" en minutos de pared
 * (23:00 → 00:00): ahí se corta la corrida igual que si hubiera una reserva.
 */
export function maxEndTime(params: {
  slots: string[]
  startTime: string
  courtBookings: OccupancyBooking[]
}): string {
  const occupied = occupiedSlotLabels(params.courtBookings)
  const idx = params.slots.indexOf(params.startTime)
  if (idx === -1) return endLabelFromMins(hhmmToMins(params.startTime) + 60)

  let prevMins = hhmmToMins(params.slots[idx]!)
  let lastFreeMins = prevMins
  for (let i = idx + 1; i < params.slots.length; i++) {
    const label = params.slots[i]!
    const mins = hhmmToMins(label)
    if (mins < prevMins) break // cruzaría medianoche
    if (occupied.has(label)) break
    lastFreeMins = mins
    prevMins = mins
  }
  return endLabelFromMins(Math.min(lastFreeMins + 60, END_OF_DAY_MINS))
}

/** Opciones de fin ofrecidas (cada hora entera desde `startTime`+1h hasta el tope). */
export function endTimeOptions(params: {
  slots: string[]
  startTime: string
  courtBookings: OccupancyBooking[]
}): string[] {
  const max = maxEndTime(params)
  const maxMins = max === '24:00' ? END_OF_DAY_MINS : hhmmToMins(max)
  const startMins = hhmmToMins(params.startTime)
  const out: string[] = []
  for (let m = startMins + 60; m <= maxMins; m += 60) out.push(endLabelFromMins(m))
  return out.length > 0 ? out : [endLabelFromMins(startMins + 60)]
}

/** Duración en horas entre dos HH:MM (o "24:00"), asumiendo que no cruzan medianoche. */
export function durationHours(timeStart: string, timeEnd: string): number {
  const start = hhmmToMins(timeStart)
  const end = timeEnd === '24:00' ? END_OF_DAY_MINS : hhmmToMins(timeEnd)
  return Math.max(1, Math.round((end - start) / 60))
}
