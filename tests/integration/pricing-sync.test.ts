import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { ensureRoles } from '../helpers/tenant'
import {
  annualMonthlyEquivalent,
  computeSubscriptionAmount,
  monthlyListAmount,
} from '@/modules/billing/pricing'
import { PLANS, planForCourts, UNIFORM_PRICING } from '@/app/(business)/precios/plans-data'

/** Catálogo real y web: precio uniforme decidido el 02/10.
 * Importes escritos a mano para detectar drift conjunto de código/migración.
 * Catálogo global: lectura cross-tenant deliberada, sin contexto de tenant.
 */
beforeAll(async () => {
  await ensureRoles()
}, 30_000)

afterAll(async () => closeSql())

type ActivePlanRow = {
  slug: string
  max_courts: number | null
  price_first_court_cents: number | null
  price_extra_court_cents: number | null
  annual_discount_bps: number | null
}

async function loadActivePlanRows(): Promise<ActivePlanRow[]> {
  const sql = getSql()
  return sql<ActivePlanRow[]>`
    SELECT slug, max_courts,
           price_first_court_cents, price_extra_court_cents, annual_discount_bps
    FROM plans
    WHERE is_active = true
    ORDER BY sort_order
  `
}

/**
 * Los parámetros tal cual están guardados, ya validados como no-NULL. Si el
 * catálogo estuviera roto preferimos fallar acá, con el nombre de la columna,
 * antes que propagar un `null` a la fórmula.
 */
async function pricingParamsFromDb(): Promise<{
  priceFirstCourtCents: number
  priceExtraCourtCents: number
  annualDiscountBps: number
}> {
  const [plan] = await loadActivePlanRows()
  expect(plan, 'no hay ninguna fila activa en `plans`').toBeDefined()
  expect(plan!.price_first_court_cents, 'plans.price_first_court_cents').not.toBeNull()
  expect(plan!.price_extra_court_cents, 'plans.price_extra_court_cents').not.toBeNull()
  expect(plan!.annual_discount_bps, 'plans.annual_discount_bps').not.toBeNull()
  return {
    priceFirstCourtCents: plan!.price_first_court_cents!,
    priceExtraCourtCents: plan!.price_extra_court_cents!,
    annualDiscountBps: plan!.annual_discount_bps!,
  }
}

describe('catálogo de precios: una sola fila activa, lineal y sin techo', () => {
  it('`plans` tiene exactamente UNA fila activa, slug=turnogol y max_courts NULL', async () => {
    const activas = await loadActivePlanRows()

    // Más de una activa = `loadActivePlan()` (billing.service.ts) elige por
    // `sort_order` y el monto pasa a depender de un desempate silencioso.
    expect(
      activas.map((p) => p.slug),
      'tiene que quedar una sola fila activa; las 3 bandas viejas quedan is_active=false (migr. 091)',
    ).toEqual(['turnogol'])

    // El techo por plan desapareció (P3): agregar una cancha no se bloquea,
    // cuesta $30.000 más por mes. Un `max_courts` no nulo acá reviviría el
    // gate viejo sin que nadie lo pida.
    expect(activas[0]!.max_courts, 'plans.max_courts de la fila activa').toBeNull()
  })

  it('las 3 bandas viejas siguen existiendo, inactivas (no se borran: price_versions y audit_logs las referencian)', async () => {
    const sql = getSql()
    const rows = await sql<{ slug: string; is_active: boolean }[]>`
      SELECT slug, is_active FROM plans WHERE slug IN ('predio', 'complejo', 'estadio')
      ORDER BY slug
    `
    expect(rows.map((r) => r.slug)).toEqual(['complejo', 'estadio', 'predio'])
    expect(rows.every((r) => r.is_active === false)).toBe(true)
  })
})

describe('la fórmula del código sobre los parámetros de la base da los montos decididos', () => {
  // Escritos a mano desde la decisión 2026-10-02, NO derivados de la fórmula:
  // $30.000 por cancha, incluida la primera, por mes.
  it.each([
    { billedCourts: 1, monthlyCents: 3_000_000 },
    { billedCourts: 2, monthlyCents: 6_000_000 },
    { billedCourts: 3, monthlyCents: 9_000_000 },
    { billedCourts: 5, monthlyCents: 15_000_000 },
    { billedCourts: 12, monthlyCents: 36_000_000 },
    { billedCourts: 8, monthlyCents: 24_000_000 },
  ])(
    '$billedCourts cancha(s) → $monthlyCents centavos por mes',
    async ({ billedCourts, monthlyCents }) => {
      const params = await pricingParamsFromDb()

      expect(monthlyListAmount(billedCourts, params)).toBe(monthlyCents)
      // El ciclo mensual le cobra a MP exactamente la cuota de lista.
      expect(computeSubscriptionAmount({ billedCourts, cycle: 'monthly', ...params })).toBe(
        monthlyCents,
      )
    },
  )

  it('el anual descuenta exactamente los basis points guardados en la base', async () => {
    const params = await pricingParamsFromDb()

    // 1000 bps = 10% (P2, antes era 20%). Se compara contra el número LEÍDO,
    // no contra un 0.90 hardcodeado: si el dueño mueve el descuento, este test
    // sigue siendo válido y el que falla es el de los montos de arriba.
    for (const billedCourts of [1, 4, 6, 8]) {
      const lista = monthlyListAmount(billedCourts, params)
      const esperado = Math.round((lista * (10_000 - params.annualDiscountBps)) / 10_000)
      expect(annualMonthlyEquivalent(billedCourts, params), `${billedCourts} canchas`).toBe(
        esperado,
      )
    }

    // Y el valor concreto de hoy, para que un cambio de bps no pase mudo.
    expect(params.annualDiscountBps).toBe(1000)
    expect(annualMonthlyEquivalent(1, params)).toBe(2_700_000) // $27.000
  })

  it('el cobro anual del preapproval es el equivalente mensual × 12', async () => {
    const params = await pricingParamsFromDb()

    // El error que este assert existe para atajar: mandarle a MercadoPago el
    // equivalente MENSUAL en un preapproval anual, que cobra una vez al año —
    // 12 veces menos plata, en silencio.
    for (const billedCourts of [1, 4, 6, 8]) {
      expect(
        computeSubscriptionAmount({ billedCourts, cycle: 'annual', ...params }),
        `${billedCourts} canchas, ciclo anual`,
      ).toBe(annualMonthlyEquivalent(billedCourts, params) * 12)
    }

    // Una cancha, a mano: $27.000 × 12 = $324.000 al año.
    expect(computeSubscriptionAmount({ billedCourts: 1, cycle: 'annual', ...params })).toBe(
      32_400_000,
    )
  })
})

describe('/precios publica la lista uniforme del catálogo', () => {
  it('un solo plan sin techo y mismos parámetros que DB', async () => {
    expect(PLANS.map((p) => p.slug)).toEqual(['turnogol'])
    expect(PLANS[0]!.maxCourts).toBeNull()
    expect(UNIFORM_PRICING).toEqual(await pricingParamsFromDb())
  })
  it.each([
    [1, 3_000_000, 2_700_000],
    [3, 9_000_000, 8_100_000],
    [5, 15_000_000, 13_500_000],
    [12, 36_000_000, 32_400_000],
  ])(
    '%i canchas: mensual y equivalente anual públicos coinciden',
    async (courts, monthly, annual) => {
      const plan = planForCourts(courts)
      expect(plan.priceMonthly).toBe(monthly)
      expect(plan.priceAnnual).toBe(annual)
      expect(
        computeSubscriptionAmount({
          billedCourts: courts,
          cycle: 'annual',
          ...(await pricingParamsFromDb()),
        }),
      ).toBe(annual * 12)
    },
  )
})
