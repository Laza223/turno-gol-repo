/**
 * Catálogo de planes para la página pública de precios.
 *
 * Fuente v1: constantes locales — la página es 100% estática y no depende
 * de la DB en build. Mantener en sync con la tabla `plans`:
 * src/shared/db/migrations/043_update_plan_pricing.sql (seed base: 007).
 */

export type BillingCycle = 'monthly' | 'annual'

export type PlanCard = {
  slug: 'predio' | 'complejo' | 'estadio'
  name: string
  /** null = canchas ilimitadas. */
  maxCourts: number | null
  rangeLabel: string
  /** Centavos ARS por mes (ciclo mensual). */
  priceMonthly: number
  /** Centavos ARS por mes pagando el año (20% off). */
  priceAnnual: number
  /** Una sola línea: todos los planes tienen TODO, cambia solo el tamaño. */
  sizeLine: string
}

export const PLANS: readonly PlanCard[] = [
  {
    slug: 'predio',
    name: 'Predio',
    maxCourts: 2,
    rangeLabel: '1 o 2 canchas',
    priceMonthly: 5500000,
    priceAnnual: 4400000,
    sizeLine: 'Todo TurnoGol, hasta 2 canchas.',
  },
  {
    slug: 'complejo',
    name: 'Complejo',
    maxCourts: 5,
    rangeLabel: '3 a 5 canchas',
    priceMonthly: 8500000,
    priceAnnual: 6800000,
    sizeLine: 'Todo TurnoGol, hasta 5 canchas.',
  },
  {
    slug: 'estadio',
    name: 'Estadio',
    maxCourts: null,
    rangeLabel: '6 canchas o más',
    priceMonthly: 11500000,
    priceAnnual: 9200000,
    sizeLine: 'Todo TurnoGol, canchas ilimitadas.',
  },
] as const

/** Plan que corresponde a una cantidad de canchas activas. */
export function planForCourts(courts: number): PlanCard {
  if (courts <= 2) return PLANS[0]!
  if (courts <= 5) return PLANS[1]!
  return PLANS[2]!
}

/** Ahorro en centavos por año pagando con ciclo anual (12 meses de diferencia). */
export function annualSavings(plan: PlanCard): number {
  return (plan.priceMonthly - plan.priceAnnual) * 12
}
