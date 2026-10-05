import type { BillingCycle } from './billing.types'

/**
 * Motor de precio del SaaS — precio LINEAL POR CANCHA, sin techo.
 *
 * Regla vigente desde el 2026-09-17 (`docs/decisions/2026-09-17-precio-por-cancha.md`,
 * supera a D3 de `2026-09-02-experimento-30-dias.md`):
 *
 *   $47.000 la primera cancha + $30.000 por cada cancha extra, por mes.
 *   Anual: 10% off. Sin bandas, sin techo, sin descuento por volumen.
 *
 * Reemplaza a `planAmount()` (bandas Predio/Complejo/Estadio), donde el monto
 * era una columna de `plans`. Ahora el monto es una FUNCIÓN de la cantidad de
 * canchas facturadas, y la fila de `plans` solo aporta los parámetros.
 *
 * Deliberadamente recibe primitivos y no una fila de Drizzle: así el cálculo
 * se puede testear y reusar (UI incluida) sin arrastrar el schema.
 */

/** Centavos ARS. Cero canchas no existe: el piso del modelo es una cancha. */
export type PricingParams = {
  priceFirstCourtCents: number
  priceExtraCourtCents: number
  /** Descuento del ciclo anual en basis points. 1000 = 10%. */
  annualDiscountBps: number
}

export type ComputeAmountInput = PricingParams & {
  /**
   * Canchas FACTURADAS, o sea las que están cargadas en el preapproval de MP
   * (`tenant_subscriptions.billed_courts`). NO es "cuántas canchas tiene hoy
   * el complejo" — esas se cuentan con `courts WHERE status = 'online'` y solo
   * mueven este número cuando el cambio se aplica al cierre del período.
   */
  billedCourts: number
  cycle: BillingCycle
}

export class InvalidBilledCourtsError extends Error {
  readonly code = 'INVALID_BILLED_COURTS'
  constructor(public readonly billedCourts: number) {
    super(`billed_courts inválido: ${billedCourts} (tiene que ser un entero >= 1)`)
    this.name = 'InvalidBilledCourtsError'
  }
}

function assertBilledCourts(billedCourts: number): void {
  if (!Number.isInteger(billedCourts) || billedCourts < 1) {
    throw new InvalidBilledCourtsError(billedCourts)
  }
}

/**
 * Cuota MENSUAL a precio de lista, sin descuento de ciclo. Centavos ARS.
 *
 * Es la base de todo lo demás: el desglose que ve el dueño, el total anual y
 * el monto que se le manda a MercadoPago salen todos de acá.
 */
export function monthlyListAmount(
  billedCourts: number,
  params: Pick<PricingParams, 'priceFirstCourtCents' | 'priceExtraCourtCents'>,
): number {
  assertBilledCourts(billedCourts)
  return params.priceFirstCourtCents + (billedCourts - 1) * params.priceExtraCourtCents
}

/**
 * Equivalente MENSUAL del ciclo anual, ya con el descuento aplicado. Centavos.
 *
 * Existe como concepto propio porque es lo que la UI muestra ("$150.300 por
 * mes pagando el año") y porque `plans.price_annual` guardaba históricamente
 * ese mismo equivalente mensual, no el total del año.
 */
export function annualMonthlyEquivalent(billedCourts: number, params: PricingParams): number {
  const list = monthlyListAmount(billedCourts, params)
  return Math.round((list * (10_000 - params.annualDiscountBps)) / 10_000)
}

/**
 * Monto que se le cobra a MercadoPago por ciclo de facturación, en centavos.
 *
 * OJO con el ciclo anual: el preapproval anual cobra UNA vez por año, así que
 * el monto es el equivalente mensual con descuento MULTIPLICADO POR 12. Este
 * es exactamente el error que documentaba `planAmount()` — devolver el
 * equivalente mensual a pelo le manda a MP 12 veces menos de lo que va.
 */
export function computeSubscriptionAmount(input: ComputeAmountInput): number {
  const { billedCourts, cycle, ...params } = input
  if (cycle === 'annual') {
    return annualMonthlyEquivalent(billedCourts, params) * 12
  }
  return monthlyListAmount(billedCourts, params)
}

/**
 * Desglose para mostrarle al dueño: "1ª cancha $47.000 + 4 × $30.000".
 *
 * La UI NO recalcula estos números por su cuenta — los pide acá, para que la
 * pantalla y el cobro no puedan divergir.
 */
export type PriceBreakdown = {
  billedCourts: number
  firstCourtCents: number
  extraCourts: number
  extraCourtUnitCents: number
  extraCourtsTotalCents: number
  /** Cuota mensual de lista, sin descuento de ciclo. */
  monthlyListCents: number
  /** Cuota mensual efectiva del ciclo elegido (con descuento si es anual). */
  monthlyEffectiveCents: number
  /** Lo que MercadoPago cobra por ciclo: mensual = la cuota; anual = ×12. */
  chargePerCycleCents: number
  cycle: BillingCycle
  annualDiscountBps: number
  /** Cuánto ahorra en un año eligiendo anual. 0 si el ciclo es mensual. */
  annualSavingsCents: number
}

export function buildPriceBreakdown(input: ComputeAmountInput): PriceBreakdown {
  const { billedCourts, cycle, ...params } = input
  const monthlyListCents = monthlyListAmount(billedCourts, params)
  const monthlyEffectiveCents =
    cycle === 'annual' ? annualMonthlyEquivalent(billedCourts, params) : monthlyListCents

  return {
    billedCourts,
    firstCourtCents: params.priceFirstCourtCents,
    extraCourts: billedCourts - 1,
    extraCourtUnitCents: params.priceExtraCourtCents,
    extraCourtsTotalCents: (billedCourts - 1) * params.priceExtraCourtCents,
    monthlyListCents,
    monthlyEffectiveCents,
    chargePerCycleCents: computeSubscriptionAmount(input),
    cycle,
    annualDiscountBps: params.annualDiscountBps,
    annualSavingsCents: cycle === 'annual' ? (monthlyListCents - monthlyEffectiveCents) * 12 : 0,
  }
}
