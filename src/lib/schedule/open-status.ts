import { addDays } from '@/shared/dates/art'
import { effectiveCloseMins, END_OF_DAY_MINS, hhmmToMins } from '@/shared/time/operating-day'
import { DAY_KEYS, type DayKey } from '@/shared/time/week-days'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

/** Lo que decide si un día se atiende: `PublicTenant` ya lo trae. */
export type ScheduleSource = {
  openingHours: OpeningHours
  closedDates: string[]
  closesNextDay: boolean
}

export type OpenStatus =
  /** `closesAt`: hora de pared del cierre ("01:00" aunque sea ya de madrugada). */
  | { open: true; closesAt: string }
  /** `opensAt`: apertura de HOY si todavía no abrió; `null` si hoy ya cerró o no se atiende. */
  | { open: false; opensAt: string | null }

/** El día de la semana de una fecha `YYYY-MM-DD` ('mon'…'sun'). */
export function dayKeyOf(date: string): DayKey {
  return DAY_KEYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!
}

/** Hora de pared para mostrar: el cierre a medianoche se guarda como "24:00" y se dice "00:00". */
export function wallClock(hhmm: string): string {
  return hhmm.startsWith('24:') ? '00:00' : hhmm.slice(0, 5)
}

/**
 * Horario del día de `date`. Mismo criterio que `getPublicAvailability`: un día sin entrada en
 * `openingHours` cae a 08:00–23:00, y `closedDates` o `closed` lo cierran entero.
 */
export function hoursOf(date: string, { openingHours, closedDates }: ScheduleSource) {
  const day = openingHours[dayKeyOf(date)]
  return {
    open: day?.open ?? '08:00',
    close: day?.close ?? '23:00',
    closed: day?.closed === true || closedDates.includes(date),
  }
}

/**
 * "01:00" → "la 01:00"; el resto → "las 23:00" (para "hasta la 01:00", "abre a las 10:00"). El
 * cierre a medianoche se guarda como "24:00" y se dice "00:00", como en el resto de la app.
 */
export function hourPhrase(hhmm: string): string {
  const time = wallClock(hhmm)
  return `${time.startsWith('01:') ? 'la' : 'las'} ${time}`
}

/** ¿El complejo no atiende ese día (feriado o día cerrado de la semana)? */
export function isDayClosed(date: string, schedule: ScheduleSource): boolean {
  return hoursOf(date, schedule).closed
}

/** Primer día posterior a `from`, hasta `maxDate` inclusive, en que el complejo atiende. */
export function nextOpenDay(
  from: string,
  maxDate: string,
  schedule: ScheduleSource,
): string | null {
  for (let date = addDays(from, 1); date <= maxDate; date = addDays(date, 1)) {
    if (!isDayClosed(date, schedule)) return date
  }
  return null
}

/**
 * La próxima apertura después de `from`: el primer día de la semana siguiente con turnos
 * (`isDayServed`) y a qué hora abre. Es para decir "abre mañana a las 10:00" cuando hoy ya cerró;
 * no depende de cuántos días deja reservar el complejo.
 */
export function nextOpening(
  from: string,
  schedule: ScheduleSource,
): { date: string; opensAt: string } | null {
  for (let date = addDays(from, 1); date <= addDays(from, 7); date = addDays(date, 1)) {
    if (isDayServed(date, schedule)) return { date, opensAt: hoursOf(date, schedule).open }
  }
  return null
}

/**
 * ¿Está abierto ahora? `now` es la hora ART del visitante (`useArtNow()`), así que se calcula en
 * el cliente: el servidor no conoce ni el reloj ni el día del visitante (la página es ISR). Antes
 * de hidratar `useArtNow()` devuelve `date: ''`: no llamar hasta que traiga fecha.
 *
 * Con `closes_next_day` hay que mirar también el horario de AYER: a las 00:30 de un complejo que
 * cierra a la 01:00, hoy todavía no abrió pero el día operativo de ayer sigue corriendo. La
 * aritmética de cierre es la de `effectiveCloseMins`; no se reimplementa.
 */
export function getOpenStatus(
  now: { date: string; time: string },
  schedule: ScheduleSource,
): OpenStatus {
  const nowMins = hhmmToMins(now.time)

  const yesterday = hoursOf(addDays(now.date, -1), schedule)
  if (schedule.closesNextDay && !yesterday.closed) {
    const yesterdayClose = effectiveCloseMins(yesterday.open, yesterday.close, true)
    if (nowMins < yesterdayClose - END_OF_DAY_MINS) return { open: true, closesAt: yesterday.close }
  }

  const today = hoursOf(now.date, schedule)
  if (today.closed) return { open: false, opensAt: null }
  const opensMins = hhmmToMins(today.open)
  const closesMins = effectiveCloseMins(today.open, today.close, schedule.closesNextDay)
  // Un horario que no avanza (08:00–01:00 sin `closes_next_day`) no genera turnos: no se atiende.
  if (closesMins <= opensMins) return { open: false, opensAt: null }
  if (nowMins < opensMins) return { open: false, opensAt: today.open }
  if (nowMins < closesMins) return { open: true, closesAt: today.close }
  return { open: false, opensAt: null }
}

/**
 * ¿Hay turnos ese día? No está cerrado y su horario avanza: 10:00–01:00 sin `closes_next_day` no
 * genera ninguno, así que ese día no se atiende aunque no figure como cerrado.
 */
export function isDayServed(date: string, schedule: ScheduleSource): boolean {
  const { open, close, closed } = hoursOf(date, schedule)
  return !closed && effectiveCloseMins(open, close, schedule.closesNextDay) > hhmmToMins(open)
}

const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' })

/** "mañana", "el lunes" o, a más de 6 días (un complejo que abre un solo día), "el lunes 20". */
function whenPhrase(today: string, date: string): string {
  if (date === addDays(today, 1)) return 'mañana'
  const weekday = WEEKDAY.format(new Date(`${date}T12:00:00Z`))
  return `el ${weekday}${date > addDays(today, 6) ? ` ${Number(date.slice(8))}` : ''}`
}

/**
 * La frase de estado de la ficha: "Abierto · hasta las 23:00", "Cerrado · abre a las 18:00",
 * "Cerrado hoy" (no se atiende en todo el día) o "Cerró por hoy · abre mañana a las 09:00".
 * `open` solo decide el color; el estado siempre va en palabras.
 */
export function describeOpenStatus(
  now: { date: string; time: string },
  schedule: ScheduleSource,
): { open: boolean; text: string } {
  const status = getOpenStatus(now, schedule)
  if (status.open) return { open: true, text: `Abierto · hasta ${hourPhrase(status.closesAt)}` }
  if (status.opensAt) return { open: false, text: `Cerrado · abre a ${hourPhrase(status.opensAt)}` }
  // Sin apertura hoy: o no se atiende en todo el día, o ya cerró.
  if (!isDayServed(now.date, schedule)) return { open: false, text: 'Cerrado hoy' }
  const next = nextOpening(now.date, schedule)
  return {
    open: false,
    text: next
      ? `Cerró por hoy · abre ${whenPhrase(now.date, next.date)} a ${hourPhrase(next.opensAt)}`
      : 'Cerró por hoy',
  }
}
