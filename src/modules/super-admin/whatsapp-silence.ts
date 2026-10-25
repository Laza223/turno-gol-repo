import { effectiveCloseMins, END_OF_DAY_MINS, hhmmToMins } from '@/shared/time/operating-day'

/**
 * Silencio anómalo de un número: horas con el complejo ABIERTO sin un solo
 * entrante. Pura (sin DB) para que la compartan el cron de alertas y el monitor.
 *
 * Se cuentan horas de horario del complejo y no de reloj: de madrugada o con el
 * complejo cerrado es normal que nadie escriba.
 */

/** Horas abiertas sin entrantes a partir de las cuales se avisa (REQUIERE INPUT: 6 h propuestas). */
export const SILENCE_ALERT_OPEN_HOURS = 6

const HOUR_MS = 3600_000
const ART_OFFSET_MS = 3 * HOUR_MS
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

type DayHours = { open: string; close: string; closed?: boolean }
export type OpeningHoursMap = Partial<Record<(typeof WEEKDAYS)[number], DayHours>>

/** ¿Está abierto el complejo en este instante? Con `closesNextDay`, la madrugada cuenta para el día anterior. */
function isOpenAt(instant: Date, hours: OpeningHoursMap, closesNextDay: boolean): boolean {
  const art = new Date(instant.getTime() - ART_OFFSET_MS)
  const mins = art.getUTCHours() * 60 + art.getUTCMinutes()
  const dow = art.getUTCDay()

  const today = hours[WEEKDAYS[dow]!]
  if (today && !today.closed) {
    const close = effectiveCloseMins(today.open, today.close, closesNextDay)
    if (mins >= hhmmToMins(today.open) && mins < Math.min(close, END_OF_DAY_MINS)) return true
  }
  const yesterday = hours[WEEKDAYS[(dow + 6) % 7]!]
  if (yesterday && !yesterday.closed && closesNextDay) {
    const close = effectiveCloseMins(yesterday.open, yesterday.close, true)
    if (mins + END_OF_DAY_MINS < close) return true
  }
  return false
}

/** Horas de horario abierto en [since, now), muestreadas cada 15 minutos. */
export function openHoursBetween(args: {
  since: Date
  now: Date
  openingHours: OpeningHoursMap
  closesNextDay: boolean
}): number {
  const step = HOUR_MS / 4
  let open = 0
  for (let t = args.since.getTime(); t < args.now.getTime(); t += step) {
    if (isOpenAt(new Date(t), args.openingHours, args.closesNextDay)) open++
  }
  return open / 4
}

/**
 * ¿Silencio anómalo? `lastInboundAt` o, si nunca hubo, el momento en que se
 * conectó el número (`floor`): uno recién conectado no alerta hasta pasadas N horas abiertas.
 */
export function isInboundSilent(args: {
  lastInboundAt: Date | null
  floor: Date
  now: Date
  openingHours: OpeningHoursMap
  closesNextDay: boolean
}): boolean {
  const since =
    args.lastInboundAt && args.lastInboundAt > args.floor ? args.lastInboundAt : args.floor
  try {
    return (
      openHoursBetween({
        since,
        now: args.now,
        openingHours: args.openingHours,
        closesNextDay: args.closesNextDay,
      }) >= SILENCE_ALERT_OPEN_HOURS
    )
  } catch {
    // Un horario mal formado de un complejo no tumba la alerta ni el monitor de todos.
    return false
  }
}
