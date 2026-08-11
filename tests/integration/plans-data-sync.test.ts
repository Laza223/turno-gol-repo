import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { ensureRoles } from '../helpers/tenant'
import { PLANS, planForCourts } from '@/app/(business)/precios/plans-data'

/**
 * Candado contra la clase "tres listas de precios vivas"
 * (`docs/planning/2026-08-07-analisis-rubro-y-decisiones.md` §5.3.3).
 *
 * `plans-data.ts` es una constante estática porque `/precios` es 100% estática
 * y no puede pegarle a la DB en build. El costo de esa decisión es que el
 * catálogo público y la tabla `plans` pueden divergir en silencio: la página
 * anuncia un precio y el checkout cobra otro. Ya pasó dos veces con los
 * límites de canchas — `doc4` §8 y `planForCourts` quedaron con los valores
 * viejos después de la migr. 043 y nadie se enteró hasta agosto.
 *
 * No es teórico: `ActivatePlanSection` muestra los precios que le llegan de la
 * DB por props, pero elige el plan sugerido con `planForCourts`, que sale de
 * esta constante. Divergencia = la UI sugiere un plan y cobra el de al lado.
 *
 * Corre en integración y no en unit a propósito: necesita la tabla real, con
 * las migraciones aplicadas en orden.
 */

beforeAll(async () => {
  await ensureRoles()
}, 30_000)

afterAll(async () => closeSql())

type PlanRow = {
  slug: string
  max_courts: number | null
  price_monthly: number
  price_annual: number
}

describe('plans-data.ts está en sync con la tabla `plans`', () => {
  it('cada plan del catálogo público existe en la DB con el mismo precio y techo', async () => {
    const sql = getSql()
    const rows = await sql<PlanRow[]>`
      SELECT slug, max_courts, price_monthly, price_annual FROM plans
    `
    const bySlug = new Map(rows.map((r) => [r.slug, r]))

    for (const plan of PLANS) {
      const row = bySlug.get(plan.slug)
      expect(row, `el plan '${plan.slug}' del catálogo no existe en la tabla plans`).toBeDefined()
      expect(row!.max_courts, `max_courts de '${plan.slug}'`).toBe(plan.maxCourts)
      expect(row!.price_monthly, `price_monthly de '${plan.slug}'`).toBe(plan.priceMonthly)
      expect(row!.price_annual, `price_annual de '${plan.slug}'`).toBe(plan.priceAnnual)
    }
  })

  it('no hay planes activos en la DB que el catálogo público no muestre', async () => {
    const sql = getSql()
    const rows = await sql<{ slug: string }[]>`
      SELECT slug FROM plans WHERE is_active = true
    `
    // Set<string> explícito: `plan.slug` es una unión literal, y sin ensanchar
    // el tipo, `.has(string)` no compila.
    const publicSlugs = new Set<string>(PLANS.map((p) => p.slug))
    const huerfanos = rows.map((r) => r.slug).filter((s) => !publicSlugs.has(s))

    // Un plan activo que /precios no lista es vendible pero invisible.
    expect(
      huerfanos,
      `planes activos ausentes del catálogo público: ${huerfanos.join(', ')}`,
    ).toEqual([])
  })

  it('planForCourts coincide con el techo declarado de cada plan', () => {
    // Los bordes exactos, que son donde vivían los off-by-one: el último valor
    // que entra en un plan y el primero que salta al siguiente.
    for (let i = 0; i < PLANS.length; i++) {
      const plan = PLANS[i]!
      if (plan.maxCourts === null) continue

      expect(planForCourts(plan.maxCourts).slug, `${plan.maxCourts} canchas`).toBe(plan.slug)

      const next = PLANS[i + 1]
      if (next) {
        expect(planForCourts(plan.maxCourts + 1).slug, `${plan.maxCourts + 1} canchas`).toBe(
          next.slug,
        )
      }
    }
  })

  it('el anual es exactamente 20% off del mensual en los tres planes', () => {
    // La regla de negocio está escrita en doc4 y en cada migración de precios;
    // sin candado, un ajuste manual puede romperla sin que nada falle.
    for (const plan of PLANS) {
      expect(plan.priceAnnual, `anual de '${plan.slug}'`).toBe(Math.round(plan.priceMonthly * 0.8))
    }
  })
})
