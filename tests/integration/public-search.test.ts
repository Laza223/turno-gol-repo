import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { listPublicCities, searchPublicTenants } from '@/modules/tenants/search.service'
import { cleanupAll, ensureRoles } from '../helpers/tenant'

const TAG = `srch${Date.now()}`

async function seed() {
  const sql = getSql()
  // F-004 (QA prod 2026-08-17): searchPublicTenants/listPublicCities ahora
  // exigen onboarding cerrado además del status — sin esto los 3 tenants de
  // este seed quedarían fuera por incompletitud, no por lo que el test
  // quiere ejercitar (status).
  await sql`
    INSERT INTO tenants (slug, name, address, city, province, phone, email, status, settings)
    VALUES
      (${`${TAG}-a`}, ${`${TAG} Goleador`}, 'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}a@t.local`}, 'active', '{"onboarding_completed": true}'::jsonb),
      (${`${TAG}-b`}, ${`${TAG} Mundialito`}, 'x', 'Córdoba', 'Córdoba', '1', ${`${TAG}b@t.local`}, 'trialing', '{"onboarding_completed": true}'::jsonb),
      (${`${TAG}-c`}, ${`${TAG} Suspendido`}, 'x', 'Mendoza', 'Mendoza', '1', ${`${TAG}c@t.local`}, 'suspended', '{"onboarding_completed": true}'::jsonb)
  `
}

beforeAll(async () => {
  await ensureRoles()
  await seed()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('searchPublicTenants', () => {
  it('returns only active/trialing matching the name query', async () => {
    const { results, total } = await searchPublicTenants({ q: TAG })
    expect(total).toBe(2)
    const slugs = results.map((r) => r.slug).sort()
    expect(slugs).toEqual([`${TAG}-a`, `${TAG}-b`])
  })

  it('filters by city', async () => {
    const { results } = await searchPublicTenants({ q: TAG, city: 'Mendoza' })
    expect(results).toHaveLength(1)
    expect(results[0]!.slug).toBe(`${TAG}-a`)
  })
})

describe('searchPublicTenants — precios ocultos (settings.hide_public_prices)', () => {
  const HIDE = `${TAG}hide`

  beforeAll(async () => {
    const sql = getSql()
    // from_price_cents lo mantiene un trigger de courts; acá se setea directo
    // porque lo que se prueba es la lectura, no el recálculo.
    await sql`
      INSERT INTO tenants (slug, name, address, city, province, phone, email, status, settings, from_price_cents, from_price_per_player_cents)
      VALUES
        (${`${HIDE}-oculto`}, ${`${HIDE} Oculto`}, 'x', 'Salta', 'Salta', '1', ${`${HIDE}o@t.local`}, 'active', '{"onboarding_completed": true, "hide_public_prices": true}'::jsonb, 1000000, 100000),
        (${`${HIDE}-visible`}, ${`${HIDE} Visible`}, 'x', 'Salta', 'Salta', '1', ${`${HIDE}v@t.local`}, 'active', '{"onboarding_completed": true}'::jsonb, 1000000, 100000)
    `
  })

  it('el complejo que oculta precios sale en la búsqueda, pero sin precio', async () => {
    const { results } = await searchPublicTenants({ q: HIDE })
    const oculto = results.find((r) => r.slug === `${HIDE}-oculto`)
    const visible = results.find((r) => r.slug === `${HIDE}-visible`)
    expect(oculto).toBeDefined()
    expect(oculto!.fromPriceCents).toBeNull()
    expect(oculto!.fromPricePerPlayerCents).toBeNull()
    // Control: el mismo precio en un complejo que no lo oculta sí viaja.
    expect(visible!.fromPriceCents).toBe(1000000)
  })

  it('un filtro de rango de precio no lo encuentra (si no, el rango delataría el precio)', async () => {
    const { results } = await searchPublicTenants({
      q: HIDE,
      minPriceCents: 900000,
      maxPriceCents: 1100000,
    })
    expect(results.map((r) => r.slug)).toEqual([`${HIDE}-visible`])
  })
})

describe('listPublicCities', () => {
  it('groups visible tenants by city (excludes suspended)', async () => {
    const cities = await listPublicCities()
    const mendoza = cities.find((c) => c.city === 'Mendoza')
    expect(mendoza).toBeDefined()
    expect(mendoza!.count).toBeGreaterThanOrEqual(1)
  })
})
