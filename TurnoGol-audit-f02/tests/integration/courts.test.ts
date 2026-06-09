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
      prices: { '60': 800000, '120': 1500000 },
    },
    {
      days: ['mon', 'tue', 'wed', 'thu'],
      from: '18:00',
      to: '23:00',
      prices: { '60': 1200000, '120': 2300000 },
    },
    {
      days: ['fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 1500000, '120': 2900000 },
    },
  ],
}

const COURT_INPUT = {
  name: 'Cancha Test',
  surfaceType: 'synthetic_grass' as const,
  capacity: 10 as const,
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
    expect(court.capacity).toBe(10)
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
