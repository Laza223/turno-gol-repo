import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 800000,
    },
  ],
}

beforeAll(async () => {
  await ensureRoles()
})
afterAll(async () => {
  await cleanupAll()
  await closeSql()
})

describe('getPublicWeeklyAvailability', () => {
  it('returns 7 consecutive days each with the online court', async () => {
    const sql = getSql()
    const t = await createTestTenant(sql)
    await sql`UPDATE tenants SET status = 'active' WHERE id = ${t.id}`
    await sql`
      INSERT INTO courts (tenant_id, name, capacity, pricing, status)
      VALUES (${t.id}, 'Cancha 1', 10, ${sql.json(PRICING)}, 'online')
    `
    const tenant = await getPublicTenant(t.slug)
    expect(tenant).not.toBeNull()

    const week = await getPublicWeeklyAvailability(tenant!, '2099-06-15')
    expect(week.startDate).toBe('2099-06-15')
    expect(week.days).toHaveLength(7)
    expect(week.days[0]!.date).toBe('2099-06-15')
    expect(week.days[6]!.date).toBe('2099-06-21')
    expect(week.days[0]!.courts).toHaveLength(1)
    expect(week.days[0]!.courts[0]!.slots.length).toBeGreaterThan(0)
  })
})
