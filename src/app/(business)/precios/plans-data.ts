/**
 * SNAPSHOT DE MARKETING CONGELADO A PROPÓSITO — no es el catálogo real.
 *
 * Desde el 2026-09-17 este archivo NO se sincroniza con la tabla `plans`, y la
 * divergencia es deliberada (decisión del dueño,
 * `docs/decisions/2026-09-17-precio-por-cancha.md` P6):
 *
 *   - La tabla `plans` tiene UNA sola fila activa (`slug = 'turnogol'`,
 *     `max_courts = NULL`) con precio LINEAL por cancha: $47.000 la primera +
 *     $30.000 por cada extra, anual 10% off (migr. 090/091). El monto lo
 *     calcula `src/modules/billing/pricing.ts`, no una columna.
 *   - Acá siguen los tres planes por bandas (Predio/Complejo/Estadio) con los
 *     precios de la migr. 071 y el 20% off anual. Esas tres filas quedaron con
 *     `is_active = false` en la DB.
 *
 * El cobro real y el panel del complejo ya pasaron al precio por cancha; lo
 * único que sigue con la lista vieja es la comunicación comercial pública, que
 * el dueño decide aparte. El panel de `/settings/facturacion` ya NO importa
 * este archivo (grep, 2026-09-17): los únicos consumidores son las tres piezas
 * de `/precios`.
 *
 * NO "corregir" estos números para que matcheen la DB. Rediseñar `/precios`
 * con una lista lineal sin techo es una decisión pendiente del dueño (anotada
 * en `docs/tech-debt.md`), no un bug de sincronización.
 *
 * OJO: el candado `tests/integration/plans-data-sync.test.ts` fue escrito para
 * PROHIBIR esta divergencia ("no hay planes activos en la DB que el catálogo
 * público no muestre"), no para verificarla. Hasta que se reescriba, falla a
 * propósito — y no se arregla tocando este archivo.
 *
 * Fuente v1: constantes locales — la página es 100% estática y no depende de la
 * DB en build. Precios de `071_align_plan_tiers_with_atc.sql` (previa: 043,
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
  return (
    PLANS.find((p) => p.maxCourts === null || courts <= p.maxCourts) ?? PLANS[PLANS.length - 1]!
  )
}

/** Ahorro en centavos por año pagando con ciclo anual (12 meses de diferencia). */
export function annualSavings(plan: PlanCard): number {
  return (plan.priceMonthly - plan.priceAnnual) * 12
}
