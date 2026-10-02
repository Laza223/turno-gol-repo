import {
  annualMonthlyEquivalent,
  monthlyListAmount,
  type PricingParams,
} from '@/modules/billing/pricing'

/** Parámetros públicos estáticos, contrastados con el catálogo real por pricing-sync.test.ts. */
export const UNIFORM_PRICING: PricingParams = {
  priceFirstCourtCents: 3_000_000,
  priceExtraCourtCents: 3_000_000,
  annualDiscountBps: 1000,
}

export type BillingCycle = 'monthly' | 'annual'

export type PlanCard = {
  slug: 'turnogol'
  name: string
  /** null = sin techo de canchas; cada cancha se cobra. */
  maxCourts: number | null
  rangeLabel: string
  /** Centavos ARS por mes (ciclo mensual). */
  priceMonthly: number
  /** Centavos ARS por mes pagando el año (10% off). */
  priceAnnual: number
  sizeLine: string
}

/** Precio exacto para una cantidad positiva y entera de canchas. */
export function planForCourts(courts: number): PlanCard {
  return {
    slug: 'turnogol',
    name: 'TurnoGol',
    maxCourts: null,
    rangeLabel: `${courts} ${courts === 1 ? 'cancha' : 'canchas'}`,
    priceMonthly: monthlyListAmount(courts, UNIFORM_PRICING),
    priceAnnual: annualMonthlyEquivalent(courts, UNIFORM_PRICING),
    sizeLine: 'Todo TurnoGol. Pagás por cada cancha, sin límite de cantidad.',
  }
}

/** Base de una cancha para metadata y calculadora, sin consultas a DB en build. */
export const PLANS: readonly PlanCard[] = [planForCourts(1)]

/** Ahorro en centavos por año pagando con ciclo anual (12 meses de diferencia). */
export function annualSavings(plan: PlanCard): number {
  return (plan.priceMonthly - plan.priceAnnual) * 12
}
