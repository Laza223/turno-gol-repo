import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { ensureRoles } from '../helpers/tenant'
import {
  annualMonthlyEquivalent,
  computeSubscriptionAmount,
  monthlyListAmount,
} from '@/modules/billing/pricing'
import { PLANS } from '@/app/(business)/precios/plans-data'

/**
 * Candado anti-drift del catálogo de precios. Reemplaza a
 * `plans-data-sync.test.ts`, cuyas DOS premisas murieron el 2026-09-17
 * (`docs/decisions/2026-09-17-precio-por-cancha.md`):
 *
 *   1. "la tabla `plans` y `/precios` muestran los mismos planes" — ahora
 *      divergen A PROPÓSITO (P6, ver el último `it` de este archivo);
 *   2. "el anual es 20% off" — pasó a 10% (P2).
 *
 * Lo que queda por vigilar es otra cosa, y es más chica y más importante: que
 * la FÓRMULA del código y los PARÁMETROS de la base sigan dando los montos que
 * el dueño decidió. Los montos van escritos a mano abajo: un test que los
 * recalcula con la misma fórmula que está probando no prueba nada — se pone
 * verde igual si alguien cambia $30.000 por $3.000 en la migración Y en el
 * código.
 *
 * Corre en integración y no en unit a propósito: la mitad del contrato
 * (`price_first_court_cents`, `price_extra_court_cents`,
 * `annual_discount_bps`) vive en la tabla real, con las migraciones aplicadas
 * en orden.
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
  // Escritos a mano desde la decisión P1, NO derivados de la fórmula:
  // $47.000 la primera cancha + $30.000 por cada extra, por mes.
  it.each([
    { billedCourts: 1, monthlyCents: 4_700_000 },
    { billedCourts: 4, monthlyCents: 13_700_000 },
    { billedCourts: 6, monthlyCents: 19_700_000 },
    { billedCourts: 8, monthlyCents: 25_700_000 },
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
    expect(annualMonthlyEquivalent(1, params)).toBe(4_230_000) // $42.300
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

    // Una cancha, a mano: $42.300 × 12 = $507.600 al año.
    expect(computeSubscriptionAmount({ billedCourts: 1, cycle: 'annual', ...params })).toBe(
      50_760_000,
    )
  })
})

describe('/precios sigue mostrando los 3 planes VIEJOS, a propósito', () => {
  it('plans-data.ts NO está sincronizado con la tabla, y eso es la decisión P6', async () => {
    // ⚠️ ESTO NO ES UN BUG DE SINCRONIZACIÓN. Decisión del dueño,
    // `docs/decisions/2026-09-17-precio-por-cancha.md` P6: el cobro real y el
    // panel del complejo ya pasaron a precio por cancha, pero la web comercial
    // pública sigue con la lista vieja hasta que él decida comunicarla.
    //
    // Este test está escrito al revés que el candado que reemplaza: AFIRMA la
    // divergencia para que nadie la "corrija" pensando que quedó colgada. Si
    // se cae, la pregunta correcta es "¿el dueño ya dio la orden de comunicar
    // la lista nueva?", no "¿qué archivo toco para que vuelva a pasar?".
    expect(PLANS.map((p) => p.slug)).toEqual(['predio', 'complejo', 'estadio'])
    expect(PLANS.map((p) => p.priceMonthly)).toEqual([6_300_000, 9_900_000, 12_900_000])
    // Y con el 20% off anual viejo, que en la base ya es 10%.
    for (const plan of PLANS) {
      expect(plan.priceAnnual, `anual de '${plan.slug}'`).toBe(Math.round(plan.priceMonthly * 0.8))
    }

    // El control que hace que este test signifique algo: ninguno de esos 3
    // slugs está activo en la base. Sin esto, el bloque de arriba se pondría
    // verde también en el mundo donde nada cambió.
    const activas = await loadActivePlanRows()
    // `Set<string>` explícito: `activas[n].slug` sale de la tabla real y hoy
    // incluye 'turnogol' (migr. 091), que `PlanCard['slug']` (plans-data.ts)
    // NO tiene a propósito (P6, snapshot congelado). Ensanchar el Set local
    // es lo mínimo — ensanchar `PlanCard['slug']` para que matchee rompería
    // esa divergencia deliberada.
    const publicos = new Set<string>(PLANS.map((p) => p.slug))
    expect(
      activas.filter((p) => publicos.has(p.slug)),
      'ningún plan de /precios debería estar activo en la tabla después de la migr. 091',
    ).toEqual([])
  })
})
