import { artDateOf } from '@/shared/time/art-date'

/**
 * El plan de Kapso vigente y su ciclo de facturación. El cupo de mensajes se
 * reinicia por ciclo de la suscripción y no por mes calendario.
 *
 * Kapso no le da estos datos a la app: se copian a mano de la facturación del
 * proyecto. **Al cambiar de plan hay que actualizar acá el nombre, el cupo y el
 * ancla** (la suscripción nueva arranca otro ciclo).
 */
export const KAPSO_PLAN = {
  name: 'Free',
  /** Mensajes incluidos por ciclo, entrantes y salientes. */
  messagesPerCycle: 2000,
  /** Alta de la suscripción: de acá salen el día y la hora del corte. */
  cycleAnchor: new Date('2026-10-21T02:04:39-03:00'),
} as const

export type CycleWindow = {
  /** Día ART en que arrancó el ciclo: identifica al ciclo en las claves de alerta. */
  startDay: string
  fromUtc: Date
  toUtc: Date
}

const DAY_MS = 24 * 3600_000

/**
 * El corte que cae en un mes dado. Como lo factura Stripe (el cobrador de
 * Kapso): el día y la hora del ancla en UTC, y en un mes que no tiene ese día,
 * el último. Sale siempre del ancla, no del corte anterior: después de febrero,
 * un ancla del 31 vuelve al 31.
 */
function cutInMonth(anchor: Date, year: number, monthIndex: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
    ),
  )
}

/** El ciclo de Kapso que contiene a `now`: [fromUtc, toUtc). */
export function kapsoCycleWindow(now: Date, anchor: Date = KAPSO_PLAN.cycleAnchor): CycleWindow {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const startMonth = cutInMonth(anchor, year, month) <= now ? month : month - 1
  const fromUtc = cutInMonth(anchor, year, startMonth)
  return {
    startDay: artDateOf(fromUtc),
    fromUtc,
    toUtc: cutInMonth(anchor, year, startMonth + 1),
  }
}

/**
 * Proyección lineal al cierre del ciclo y día (ART) en que se pasaría `limit`
 * (`null` si la proyección no lo alcanza). Los días transcurridos tienen piso
 * de 1: recién arrancado el ciclo, dos mensajes no se extrapolan a todo el mes.
 */
export function projectCycle(args: {
  total: number
  limit: number
  window: CycleWindow
  now: Date
}): { projected: number; crossingDate: string | null } {
  const { total, limit, window, now } = args
  const from = window.fromUtc.getTime()
  const to = window.toUtc.getTime()
  const perDay = total / Math.max(1, (now.getTime() - from) / DAY_MS)
  const projected = perDay * ((to - from) / DAY_MS)
  if (projected <= limit) return { projected, crossingDate: null }
  // Si la proyección pasa el cupo, el cruce cae antes del cierre del ciclo.
  return { projected, crossingDate: artDateOf(new Date(from + (limit / perDay) * DAY_MS)) }
}
