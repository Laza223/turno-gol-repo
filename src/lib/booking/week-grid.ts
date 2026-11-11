import { addDays, DAY_KEYS, mondayOf } from '@/lib/booking/grid-cells'
import { effectiveCloseMins, hhmmToMins, startLabelFromMins } from '@/shared/time/operating-day'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

/**
 * Eje de la vista por semana: siete días (lunes a domingo) contra UNA hilera de
 * horas común. Cada día abre y cierra a su hora, así que el eje es la unión de
 * los días abiertos y cada celda sabe si su día la ofrece.
 *
 * Las horas son minutos continuos desde la medianoche del día operativo (la
 * madrugada de un complejo que cierra pasada la medianoche cae después de 1440),
 * igual que `generateTimeSlots`; las etiquetas salen de `operating-day.ts`.
 */

type DayHours = {
  /** Apertura en HH:MM, para `slotHasPassed` (que la necesita por día). */
  openHhmm: string
  openMins: number
  closeMins: number
}

export type WeekAxis = {
  /** Lunes a domingo, YYYY-MM-DD. */
  days: string[]
  /** Etiquetas HH:MM de cada fila (una por hora). */
  slots: string[]
  /** Horario de cada día; `null` si ese día está cerrado. */
  hours: Map<string, DayHours | null>
  /** Minutos continuos de la primera fila. */
  startMins: number
}

/** Los siete días (lunes a domingo) de la semana que contiene a `date`. */
export function weekDays(date: string): string[] {
  const monday = mondayOf(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function buildWeekAxis(params: {
  date: string
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
}): WeekAxis {
  const days = weekDays(params.date)
  const hours = new Map<string, DayHours | null>()
  let startMins = Infinity
  let endMins = -Infinity

  for (const day of days) {
    const dayHours = params.openingHours[DAY_KEYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!]
    if (!dayHours || dayHours.closed === true || params.closedDates.includes(day)) {
      hours.set(day, null)
      continue
    }
    const openMins = hhmmToMins(dayHours.open)
    const closeMins = effectiveCloseMins(dayHours.open, dayHours.close, params.closesNextDay)
    if (closeMins <= openMins) {
      hours.set(day, null)
      continue
    }
    hours.set(day, { openHhmm: dayHours.open, openMins, closeMins })
    startMins = Math.min(startMins, openMins)
    endMins = Math.max(endMins, closeMins)
  }

  const slots: string[] = []
  if (Number.isFinite(startMins)) {
    for (let m = startMins; m < endMins; m += SLOT_DURATION_MINUTES) {
      slots.push(startLabelFromMins(m))
    }
  }
  return { days, slots, hours, startMins: Number.isFinite(startMins) ? startMins : 0 }
}

/** ¿El día ofrece un turno que arranca en la fila `rowIndex` del eje? */
export function isSlotOpenOnDay(axis: WeekAxis, day: string, rowIndex: number): boolean {
  const h = axis.hours.get(day)
  if (!h) return false
  const m = axis.startMins + rowIndex * SLOT_DURATION_MINUTES
  return m >= h.openMins && m < h.closeMins && (m - h.openMins) % SLOT_DURATION_MINUTES === 0
}

/** Las horas de un día en particular (las que ve el modal de alta), en etiquetas HH:MM. */
export function daySlotsOf(axis: WeekAxis, day: string): string[] {
  return axis.slots.filter((_, i) => isSlotOpenOnDay(axis, day, i))
}
