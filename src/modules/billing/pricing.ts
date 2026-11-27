import { differenceInMonths } from 'date-fns'
import type { BillingCycle } from './billing.types'

/**
 * Precio de lista del bot de WhatsApp: fijo por mes y por complejo, tenga las
 * canchas que tenga. Vale para cualquier catálogo. Centavos ARS. Es provisorio
 * (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md).
 */
export const PLUS_LIST_MONTHLY_CENTS = 5_000_000

export const COURT_COUNT_PRICE_SLUG = 'turnogol-por-cantidad'
export const COURT_COUNT_QUOTE_PREFIX = 'turnogol-cotizacion-'

/** Plan solo, por cantidad exacta de canchas (1 a 7). Centavos ARS por mes. */
const COURT_COUNT_PRICES = [
  4_500_000, 6_500_000, 8_000_000, 9_500_000, 11_000_000, 12_500_000, 13_500_000,
] as const

export const MAX_CATALOG_COURTS = COURT_COUNT_PRICES.length

export class CourtCountQuoteRequiredError extends Error {
  readonly code = 'COURT_COUNT_QUOTE_REQUIRED'
  constructor() {
    super('Para 8 canchas o más, pedinos una cotización por WhatsApp.')
  }
}

/** Centavos ARS. Cero canchas no existe: el piso del modelo es una cancha. */
export type PricingParams = {
  priceFirstCourtCents: number
  priceExtraCourtCents: number
  /** Descuento del ciclo anual en basis points. 1000 = 10%. */
  annualDiscountBps: number
  byCourtCount?: true
  quotedCourtCount?: number
}

export function catalogPricing(plan: {
  slug?: string
  priceFirstCourtCents: number | null
  priceExtraCourtCents: number | null
  annualDiscountBps: number | null
}): PricingParams | null {
  if (plan.slug === COURT_COUNT_PRICE_SLUG) {
    return {
      priceFirstCourtCents: COURT_COUNT_PRICES[0],
      priceExtraCourtCents: 0,
      annualDiscountBps: 2000,
      byCourtCount: true,
    }
  }
  const quoteCount = plan.slug?.startsWith(COURT_COUNT_QUOTE_PREFIX)
    ? Number(plan.slug.slice(COURT_COUNT_QUOTE_PREFIX.length).split('-')[0])
    : undefined
  if (
    plan.priceFirstCourtCents === null ||
    plan.priceExtraCourtCents === null ||
    plan.annualDiscountBps === null
  )
    return null
  return {
    priceFirstCourtCents: plan.priceFirstCourtCents,
    priceExtraCourtCents: plan.priceExtraCourtCents,
    annualDiscountBps: plan.annualDiscountBps,
    ...(quoteCount ? { byCourtCount: true as const, quotedCourtCount: quoteCount } : {}),
  }
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
  /**
   * Plus por mes y por complejo que lleva el débito, ya resuelto con
   * `effectivePlusCents`. 0 = sin Plus. OBLIGATORIO a propósito: un caller que
   * se olvide de pasarlo no compila, en vez de cobrar el débito sin Plus en
   * silencio.
   */
  plusMonthlyCents: number
}

export class InvalidBilledCourtsError extends Error {
  readonly code = 'INVALID_BILLED_COURTS'
  constructor(public readonly billedCourts: number) {
    super(`billed_courts inválido: ${billedCourts} (tiene que ser un entero >= 1)`)
    this.name = 'InvalidBilledCourtsError'
  }
}

/** Precio de Plus inválido (P10: el especial tiene que ser un entero > 0; NULL es la lista). */
export class InvalidPlusPriceError extends Error {
  readonly code = 'INVALID_PLUS_PRICE'
  constructor(public readonly priceCents: number) {
    super(`Precio de Plus inválido: ${priceCents} (tiene que ser un entero de centavos > 0)`)
    this.name = 'InvalidPlusPriceError'
  }
}

function assertBilledCourts(billedCourts: number): void {
  if (!Number.isInteger(billedCourts) || billedCourts < 1) {
    throw new InvalidBilledCourtsError(billedCourts)
  }
}

/** Precio especial de Plus: NULL (= lista) o un entero de centavos > 0. Nunca cae a la lista en silencio. */
export function assertPlusSpecialPrice(priceCents: number | null): void {
  if (priceCents === null) return
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new InvalidPlusPriceError(priceCents)
}

/** Plus ya resuelto: entero >= 0 (0 = sin Plus). */
function assertPlusAmount(plusMonthlyCents: number): void {
  if (!Number.isInteger(plusMonthlyCents) || plusMonthlyCents < 0) {
    throw new InvalidPlusPriceError(plusMonthlyCents)
  }
}

/**
 * Plus por mes que entra al débito: 0 si el complejo no lo tiene prendido en su
 * suscripción, si no el precio especial o, sin él, el de lista. No depende de
 * las canchas.
 *
 * Depende SOLO de `plus_enabled` (la columna de la suscripción), nunca del
 * override del flag `whatsapp_bot`: un complejo con el bot prendido a mano por
 * SQL no paga Plus hasta que pasa por el interruptor.
 *
 * `specialPriceCents` sale de `tenant_subscriptions.plus_price_per_court_cents`:
 * el nombre de la columna quedó del precio por cancha, hoy guarda el monto
 * mensual del complejo.
 */
export function effectivePlusCents(plusEnabled: boolean, specialPriceCents: number | null): number {
  assertPlusSpecialPrice(specialPriceCents)
  if (!plusEnabled) return 0
  return specialPriceCents ?? PLUS_LIST_MONTHLY_CENTS
}

export function canQuoteCourtCount(
  billedCourts: number,
  pricing: Pick<PricingParams, 'byCourtCount' | 'quotedCourtCount'>,
): boolean {
  if (pricing.quotedCourtCount) return billedCourts === pricing.quotedCourtCount
  return !pricing.byCourtCount || billedCourts <= MAX_CATALOG_COURTS
}

function exactCourtPrice(billedCourts: number): number {
  assertBilledCourts(billedCourts)
  const price = COURT_COUNT_PRICES[billedCourts - 1]
  if (!price) throw new CourtCountQuoteRequiredError()
  return price
}

/**
 * Cuota MENSUAL a precio de lista, sin descuento de ciclo. Centavos ARS.
 *
 * Es la base de todo lo demás: el desglose que ve el dueño, el total anual y
 * el monto que se le manda a MercadoPago salen todos de acá. Es del PLAN solo;
 * Plus se suma en `computeSubscriptionAmount`.
 */
export function monthlyListAmount(
  billedCourts: number,
  params: Pick<
    PricingParams,
    'priceFirstCourtCents' | 'priceExtraCourtCents' | 'byCourtCount' | 'quotedCourtCount'
  >,
): number {
  if (params.quotedCourtCount) {
    if (!canQuoteCourtCount(billedCourts, params)) throw new CourtCountQuoteRequiredError()
    return params.priceFirstCourtCents
  }
  if (params.byCourtCount) return exactCourtPrice(billedCourts)
  assertBilledCourts(billedCourts)
  return params.priceFirstCourtCents + (billedCourts - 1) * params.priceExtraCourtCents
}

/** Aplica el descuento anual a UNA suma mensual, redondeando una sola vez. */
function applyAnnualDiscount(monthlyCents: number, annualDiscountBps: number): number {
  return Math.round((monthlyCents * (10_000 - annualDiscountBps)) / 10_000)
}

/**
 * Equivalente MENSUAL del ciclo anual del PLAN solo (sin Plus), ya con el
 * descuento aplicado. Centavos.
 *
 * Existe como concepto propio porque es lo que la UI muestra ("$135.000 por
 * mes pagando el año") y porque `plans.price_annual` guardaba históricamente
 * ese mismo equivalente mensual, no el total del año. Con Plus el equivalente
 * mensual sale de `buildPriceBreakdown` (el descuento va sobre la suma).
 */
export function annualMonthlyEquivalent(billedCourts: number, params: PricingParams): number {
  return applyAnnualDiscount(monthlyListAmount(billedCourts, params), params.annualDiscountBps)
}

/** Lista mensual del débito: plan + Plus, sin descuento de ciclo. */
function monthlyListWithPlus(input: ComputeAmountInput): number {
  assertPlusAmount(input.plusMonthlyCents)
  return monthlyListAmount(input.billedCourts, input) + input.plusMonthlyCents
}

/**
 * Monto que se le cobra a MercadoPago por ciclo de facturación, en centavos.
 *
 * OJO con el ciclo anual: el preapproval anual cobra UNA vez por año, así que
 * el monto es el equivalente mensual con descuento MULTIPLICADO POR 12. Este
 * es exactamente el error que documentaba `planAmount()` — devolver el
 * equivalente mensual a pelo le manda a MP 12 veces menos de lo que va.
 *
 * El descuento anual se aplica a la SUMA plan + Plus (P6). Con
 * `plusMonthlyCents = 0` da exactamente lo mismo que antes de Plus.
 */
export function computeSubscriptionAmount(input: ComputeAmountInput): number {
  const monthlyList = monthlyListWithPlus(input)
  if (input.cycle === 'annual') {
    return applyAnnualDiscount(monthlyList, input.annualDiscountBps) * 12
  }
  return monthlyList
}

/**
 * Desglose para mostrarle al dueño: "1ª cancha $30.000 + 4 × $30.000 + Plus".
 *
 * La UI NO recalcula estos números por su cuenta — los pide acá, para que la
 * pantalla y el cobro no puedan divergir. `monthlyListCents`,
 * `monthlyEffectiveCents`, `chargePerCycleCents` y `annualSavingsCents` son del
 * TOTAL (plan + Plus); las líneas 1ª cancha + extras + Plus suman
 * `monthlyListCents`.
 */
export type PriceBreakdown = {
  byCourtCount?: true
  billedCourts: number
  firstCourtCents: number
  extraCourts: number
  extraCourtUnitCents: number
  extraCourtsTotalCents: number
  /** Cuota mensual de lista del SOLO plan (1ª cancha + extras). */
  planMonthlyListCents: number
  /** Plus mensual de lista del complejo (0 = sin Plus). */
  plusMonthlyListCents: number
  /** Cuota mensual de lista del TOTAL (plan + Plus), sin descuento de ciclo. */
  monthlyListCents: number
  /** Cuota mensual efectiva del TOTAL en el ciclo elegido (con descuento si es anual). */
  monthlyEffectiveCents: number
  /** Lo que MercadoPago cobra por ciclo: mensual = la cuota; anual = ×12. */
  chargePerCycleCents: number
  cycle: BillingCycle
  annualDiscountBps: number
  /** Cuánto ahorra en un año eligiendo anual. 0 si el ciclo es mensual. */
  annualSavingsCents: number
}

export function buildPriceBreakdown(input: ComputeAmountInput): PriceBreakdown {
  const { billedCourts, cycle, plusMonthlyCents, ...params } = input
  const planMonthlyListCents = monthlyListAmount(billedCourts, params)
  const monthlyListCents = monthlyListWithPlus(input)
  const monthlyEffectiveCents =
    cycle === 'annual'
      ? applyAnnualDiscount(monthlyListCents, params.annualDiscountBps)
      : monthlyListCents

  return {
    ...(params.byCourtCount ? { byCourtCount: true as const } : {}),
    billedCourts,
    firstCourtCents: params.priceFirstCourtCents,
    extraCourts: billedCourts - 1,
    extraCourtUnitCents: params.priceExtraCourtCents,
    extraCourtsTotalCents: (billedCourts - 1) * params.priceExtraCourtCents,
    planMonthlyListCents,
    plusMonthlyListCents: plusMonthlyCents,
    monthlyListCents,
    monthlyEffectiveCents,
    chargePerCycleCents: computeSubscriptionAmount(input),
    cycle,
    annualDiscountBps: params.annualDiscountBps,
    annualSavingsCents: cycle === 'annual' ? (monthlyListCents - monthlyEffectiveCents) * 12 : 0,
  }
}

export type PlusProrateQuote = {
  /** Meses calendario COMPLETOS que faltan hasta `periodEnd`, acotado a [0, 12]. */
  months: number
  /** Centavos ARS a pagar por esos meses, con el descuento anual. */
  amountCents: number
}

/**
 * Cotización del alta de Plus en un anual ya pago (P7): se cobran los meses
 * completos que faltan hasta `current_period_end`, redondeando para abajo (los
 * días sueltos son la puesta en marcha), a Plus × canchas facturadas × (1 − 10%).
 *
 * El redondeo es por MES (igual que el débito anual, que redondea la cuota
 * mensual y la multiplica por 12): así 12 meses de cotización == el Plus que
 * lleva el débito de renovación, sin diferencias de centavos. `differenceInMonths`
 * es de calendario (31/ene → 28/feb es un mes completo), no de 30 días.
 */
export function plusProrateQuote(input: {
  now: Date
  periodEnd: Date
  plusMonthlyCents: number
  annualDiscountBps: number
}): PlusProrateQuote {
  assertPlusAmount(input.plusMonthlyCents)
  const months = Math.min(12, Math.max(0, differenceInMonths(input.periodEnd, input.now)))
  const monthlyCents = applyAnnualDiscount(input.plusMonthlyCents, input.annualDiscountBps)
  const amountCents = months * monthlyCents
  // `plus_prorate_cents` es integer: un precio absurdo tiene que volver como
  // precio inválido (lo traduce la action), no como "integer out of range".
  if (amountCents > PG_INT_MAX) throw new InvalidPlusPriceError(amountCents)
  return { months, amountCents }
}

const PG_INT_MAX = 2_147_483_647
