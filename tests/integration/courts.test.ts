import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createCourt, getCourtCountAndLimit } from '@/modules/courts/court.service'
import type { CourtPricingData } from '@/modules/courts/court.types'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { getOrCreatePlanId, insertSubscription } from '../helpers/factories'

const DEFAULT_PRICING: CourtPricingData = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '08:00',
      to: '18:00',
      price: 800000,
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      price: 1200000,
    },
    {
      days: ['fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 1500000,
    },
  ],
}

const COURT_INPUT = {
  name: 'Cancha Test',
  surfaceType: 'synthetic_grass' as const,
  format: 5 as const, // Fútbol 5 → capacity derivado = 10
  pricing: DEFAULT_PRICING,
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('createCourt', () => {
  it('inserts court with status online', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    const court = await withTenantContext(tenant.id, (tx) =>
      createCourt(tenant.id, COURT_INPUT, tx),
    )

    expect(court.id).toBeTruthy()
    expect(court.tenantId).toBe(tenant.id)
    expect(court.status).toBe('online')
    expect(court.name).toBe('Cancha Test')
    expect(court.surfaceType).toBe('synthetic_grass')
    expect(court.format).toBe(5)
    expect(court.capacity).toBe(10) // derivado = format × 2
    // Cambio #16: atributos por cancha con sus defaults (techada=false, luz=true).
    expect(court.isCovered).toBe(false)
    expect(court.hasLighting).toBe(true)
  })

  it('persiste is_covered/has_lighting cuando se pasan explícitos (cambio #16)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    const court = await withTenantContext(tenant.id, (tx) =>
      createCourt(
        tenant.id,
        { ...COURT_INPUT, isCovered: true, hasLighting: false },
        tx,
      ),
    )

    expect(court.isCovered).toBe(true)
    expect(court.hasLighting).toBe(false)

    // Durable en la fila, no solo en el objeto retornado.
    const rows = await sql<{ is_covered: boolean; has_lighting: boolean }[]>`
      SELECT is_covered, has_lighting FROM courts WHERE id = ${court.id}
    `
    expect(rows[0]).toEqual({ is_covered: true, has_lighting: false })
  })
})

describe('plan limit enforcement', () => {
  it('getCourtCountAndLimit returns limit=3 when predio plan linked', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const planId = await getOrCreatePlanId(sql)
    await insertSubscription(sql, { tenantId: tenant.id, planId })

    // Create 3 courts
    for (let i = 1; i <= 3; i++) {
      await withTenantContext(tenant.id, (tx) =>
        createCourt(tenant.id, { ...COURT_INPUT, name: `Cancha ${i}` }, tx),
      )
    }

    const { count, maxCourts } = await withTenantContext(tenant.id, (tx) =>
      getCourtCountAndLimit(tenant.id, tx),
    )

    expect(count).toBe(3)
    expect(maxCourts).toBe(3)
    // 4th creation would be blocked (count >= maxCourts)
    expect(count >= maxCourts!).toBe(true)
  })

  it('no subscription → maxCourts is null (unlimited)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    await withTenantContext(tenant.id, (tx) =>
      createCourt(tenant.id, COURT_INPUT, tx),
    )

    const { count, maxCourts } = await withTenantContext(tenant.id, (tx) =>
      getCourtCountAndLimit(tenant.id, tx),
    )

    expect(count).toBe(1)
    expect(maxCourts).toBeNull()
  })
})
