/**
 * Tarea #7 — Horario silencioso de push notifications al admin.
 *
 * Las reservas online entran a cualquier hora (un jugador reserva a las 2am).
 * Si el push suena de madrugada, el admin termina desactivando las
 * notificaciones. Regla: durante la madrugada del complejo (00:00–08:00 en su
 * timezone) el push no se entrega en el momento sino que se agenda para las
 * 08:00 locales; el admin ve las reservas acumuladas al abrir la app.
 *
 * Función pura: dada la hora actual y la timezone del complejo, devuelve el
 * instante (UTC) en que debe entregarse el push, o `null` si debe enviarse ya.
 */

import { PUSH_SEND_SEND_OPTIONS } from '@/shared/jobs/definitions'

/** Hora local (inclusive) a partir de la cual el push se entrega en el momento. */
const QUIET_HOURS_END = 8

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  return {
    year: map.year!,
    month: map.month!,
    day: map.day!,
    // Intl puede emitir '24' a la medianoche en algunos runtimes; normalizamos.
    hour: (map.hour ?? 0) % 24,
    minute: map.minute ?? 0,
    second: map.second ?? 0,
  }
}

/**
 * Offset de la timezone (local − UTC) en ms, evaluado en `date`. Para zonas sin
 * DST (Argentina = UTC-3) es constante; para el resto es exacto en ese instante.
 */
function tzOffsetMs(timeZone: string, date: Date): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - date.getTime()
}

/** Convierte una hora de pared local (en `timeZone`) al instante UTC equivalente. */
function zonedToUtc(p: ZonedParts, timeZone: string): Date {
  const guessUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offset = tzOffsetMs(timeZone, new Date(guessUtc))
  return new Date(guessUtc - offset)
}

/**
 * Devuelve el instante (UTC) en que debe entregarse un push al admin respetando
 * el horario silencioso del complejo, o `null` si debe enviarse en el momento.
 *
 * @param now hora actual (UTC)
 * @param timeZone timezone del complejo (ej. 'America/Argentina/Buenos_Aires')
 */
export function quietHoursReleaseAt(now: Date, timeZone: string): Date | null {
  const local = zonedParts(now, timeZone)
  if (local.hour >= QUIET_HOURS_END) return null
  return zonedToUtc(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: QUIET_HOURS_END,
      minute: 0,
      second: 0,
    },
    timeZone,
  )
}

export type PushSendOptions = typeof PUSH_SEND_SEND_OPTIONS & { startAfter?: Date }

/**
 * Opciones de envío del job de push aplicando el horario silencioso: en
 * madrugada agrega `startAfter` (pg-boss retiene el job hasta esa hora); en
 * horario operativo devuelve las opciones base sin demora.
 */
export function pushSendOptions(now: Date, timeZone: string): PushSendOptions {
  const releaseAt = quietHoursReleaseAt(now, timeZone)
  return releaseAt
    ? { ...PUSH_SEND_SEND_OPTIONS, startAfter: releaseAt }
    : { ...PUSH_SEND_SEND_OPTIONS }
}
