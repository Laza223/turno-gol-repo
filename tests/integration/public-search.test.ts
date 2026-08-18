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

describe('listPublicCities', () => {
  it('groups visible tenants by city (excludes suspended)', async () => {
    const cities = await listPublicCities()
    const mendoza = cities.find((c) => c.city === 'Mendoza')
    expect(mendoza).toBeDefined()
    expect(mendoza!.count).toBeGreaterThanOrEqual(1)
  })
})
