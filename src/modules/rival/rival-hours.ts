// Horas que ofrece el form de "Armar un partido" según el horario del complejo. Es ayuda de
// cliente: el servidor no valida el horario (decisión 2026-10-28, punto 5). Puro y sin DB.
import { addDays } from '@/shared/dates/art'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'
import { dayKeyOf, hoursOf, isDayServed, type ScheduleSource } from '@/lib/schedule/open-status'
import { effectiveCloseMins, END_OF_DAY_MINS, hhmmToMins } from '@/shared/time/operating-day'

const CANDIDATES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  return `${h}:${i % 2 === 0 ? '00' : '30'}`
})

const QUICK = ['19:00', '20:00', '21:00', '22:00']

export type RivalHourOptions = {
  /** Las horas seleccionables (HH:MM, en punto o y media), en orden. */
  all: string[]
  /** Las habituales a la vista; el resto va en "Otra hora". */
  quick: string[]
  /**
   * `past`: ya no queda ninguna hoy. `closed`: el horario del complejo deja el día sin horas
   * (cerrado, feriado o mal cargado); `all` cae a la lista completa y la vista avisa.
   */
  reason: 'ok' | 'past' | 'closed'
}

/** Ventanas [desde, hasta) en minutos desde las 00:00 del día calendario `date`. */
function windowsOf(date: string, schedule: ScheduleSource): [number, number][] {
  const windows: [number, number][] = []
  if (isDayServed(date, schedule)) {
    const { open, close } = hoursOf(date, schedule)
    const end = effectiveCloseMins(open, close, schedule.closesNextDay)
    windows.push([hhmmToMins(open), Math.min(end, END_OF_DAY_MINS)])
  }
  // La madrugada pasada la medianoche pertenece al día operativo de AYER.
  const yesterday = addDays(date, -1)
  if (schedule.closesNextDay && isDayServed(yesterday, schedule)) {
    const { open, close } = hoursOf(yesterday, schedule)
    const end = effectiveCloseMins(open, close, true)
    if (end > END_OF_DAY_MINS) windows.push([0, end - END_OF_DAY_MINS])
  }
  return windows
}

/**
 * Horas del día `date` (YYYY-MM-DD, ART). Descarta lo que ya pasó hoy (`nowTime` HH:MM ART) y, con
 * horario del complejo, deja las que entran enteras en su atención (turno de 60 min, también la
 * cola de la madrugada si cierra pasada la medianoche). Sin horario cargado para ese día va la
 * lista completa. `keep` (la hora de una reserva o repetición precargada) sigue seleccionable.
 */
export function rivalHourOptions(args: {
  date: string
  today: string
  nowTime: string
  schedule: ScheduleSource | null
  keep?: string
}): RivalHourOptions {
  const { date, today, nowTime, schedule, keep } = args
  const future = CANDIDATES.filter((t) => date !== today || t > nowTime)
  const done = (all: string[], reason: RivalHourOptions['reason']): RivalHourOptions => ({
    all,
    quick: QUICK.filter((t) => all.includes(t)),
    reason,
  })
  if (future.length === 0) return done([], 'past')
  // Un día sin clave va completo, salvo que figure en `closedDates`: ese sí avisa que está cerrado.
  if (
    !schedule ||
    (schedule.openingHours[dayKeyOf(date)] === undefined && !schedule.closedDates.includes(date))
  )
    return done(future, 'ok')

  const windows = windowsOf(date, schedule)
  const fits = (t: string) => {
    const start = hhmmToMins(t)
    return windows.some(([from, to]) => start >= from && start + SLOT_DURATION_MINUTES <= to)
  }
  if (!CANDIDATES.some(fits)) return done(future, 'closed')
  const all = future.filter((t) => fits(t) || t === keep)
  return done(all, all.length === 0 ? 'past' : 'ok')
}
