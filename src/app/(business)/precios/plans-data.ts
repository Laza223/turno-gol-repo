/**
 * Catálogo de planes para la página pública de precios.
 *
 * Fuente v1: constantes locales — la página es 100% estática y no depende
 * de la DB en build. Mantener en sync con la tabla `plans`:
 * src/shared/db/migrations/071_align_plan_tiers_with_atc.sql (previa: 043,
 * seed base: 007).
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
    maxCourts: 3,
    rangeLabel: '1 a 3 canchas',
    priceMonthly: 6300000,
    priceAnnual: 5040000,
    sizeLine: 'Todo TurnoGol, hasta 3 canchas.',
  },
  {
    slug: 'complejo',
    name: 'Complejo',
    maxCourts: 6,
    rangeLabel: '4 a 6 canchas',
    priceMonthly: 9900000,
    priceAnnual: 7920000,
    sizeLine: 'Todo TurnoGol, hasta 6 canchas.',
  },
  {
    slug: 'estadio',
    name: 'Estadio',
    maxCourts: null,
    rangeLabel: '7 canchas o más',
    priceMonthly: 12900000,
    priceAnnual: 10320000,
    sizeLine: 'Todo TurnoGol, canchas ilimitadas.',
  },
] as const

/**
 * Plan que corresponde a una cantidad de canchas activas.
 *
 * Los umbrales salen de `maxCourts` y no están escritos aparte: antes esta
 * función tenía sus propios `courts <= 2` / `<= 5`, o sea una segunda fuente
 * de verdad que podía quedar desincronizada del catálogo de arriba sin que
 * nada fallara. El primer plan cuyo `maxCourts` alcanza gana; `null` es el
 * ilimitado y siempre cierra la lista.
 */
export function planForCourts(courts: number): PlanCard {
  return PLANS.find((p) => p.maxCourts === null || courts <= p.maxCourts) ?? PLANS[PLANS.length - 1]!
}

/** Ahorro en centavos por año pagando con ciclo anual (12 meses de diferencia). */
export function annualSavings(plan: PlanCard): number {
  return (plan.priceMonthly - plan.priceAnnual) * 12
}
