import type { CourtPricingData } from '@/modules/courts/court.types'

/**
 * Lookup de la tarifa de una franja. Fuente ÚNICA.
 *
 * Había tres copias del mismo `for` sobre `pricing.rules`: `calculatePrice`
 * (court.service, sobre un `Date`), `priceForSlot` (booking.service, privada,
 * sobre dayKey+hora) y una inline en `validatePricingRulesCoverage`. Las tres
 * coincidían por casualidad, no por construcción — y el popover de alta rápida
 * (Fase 3, criterio de salida #3) necesita una CUARTA, esta vez en el cliente,
 * para mostrar el precio sin esperar al server.
 *
 * Módulo puro y sin imports de servidor a propósito: lo importan tanto los
 * services como componentes `'use client'`. Si el precio que el admin ve al
 * reservar no fuera exactamente el que graba el server, el popover estaría
 * mintiendo sobre plata.
 */

/** Índice de `Date#getUTCDay()` → clave de `pricing.rules[].days`. */
const DAY_KEYS_BY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Clave de día (`'mon'`…) de un `YYYY-MM-DD`, leído como día calendario. */
export function dayKeyOf(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return DAY_KEYS_BY_INDEX[new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1)).getUTCDay()]!
}

/**
 * Precio de la franja que contiene `hhmm` ese día. `null` = no hay regla que la
 * cubra (el caller decide: el server tira `PriceUnavailableError`, la UI muestra
 * "sin precio").
 *
 * `rule.to === '00:00'` significa medianoche = fin del día (1440), no las 00:00
 * del arranque — misma convención que `effectiveCloseMins`.
 */
export function priceForSlot(
  pricing: CourtPricingData,
  dayKey: string,
  hhmm: string,
): number | null {
  const slotMins = timeToMins(hhmm)
  for (const rule of pricing.rules) {
    if (!rule.days.includes(dayKey)) continue
    const fromMins = timeToMins(rule.from)
    const toMins = timeToMins(rule.to) === 0 ? 24 * 60 : timeToMins(rule.to)
    if (slotMins >= fromMins && slotMins < toMins) return rule.price ?? null
  }
  return null
}

/**
 * Precio a partir del día OPERATIVO y la hora de pared — la forma en que
 * hablan la grilla y `bookings` (`date` + `time_start`).
 *
 * Nota deliberada: para un complejo `closes_next_day`, un slot de madrugada
 * pertenece al día operativo anterior y se tarifa con las reglas de ESE día,
 * aunque físicamente ocurra al siguiente. Es lo que ya hacía `calculatePrice`
 * vía `artDateAt` (que construye el instante desde el día operativo), y lo que
 * hace `generateSlots`. No es un efecto colateral de esta extracción.
 */
export function priceForDateSlot(
  pricing: CourtPricingData,
  dateStr: string,
  hhmm: string,
): number | null {
  return priceForSlot(pricing, dayKeyOf(dateStr), hhmm)
}

/**
 * Seña en centavos enteros para un precio (centavos) y un porcentaje.
 * Redondeo half-up (`Math.round`): los empates van hacia +∞, no banker's.
 *
 * Vive acá y no en `modules/bookings/deposit` porque el popover de alta rápida
 * la necesita en el cliente para sugerir el monto, y un componente de
 * `@/components` no puede importar el dominio como valor (regla de lint).
 * `modules/bookings/deposit` la re-exporta para sus callers de servidor: la
 * cuenta es UNA sola, el admin no puede ver un monto sugerido distinto del que
 * el server calcularía.
 */
export function calcDepositCents(priceSnapshotCents: number, depositPercentage: number): number {
  return Math.round((priceSnapshotCents * depositPercentage) / 100)
}
