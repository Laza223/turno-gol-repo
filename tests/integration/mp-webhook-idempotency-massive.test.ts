import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { lockMpEvent } from '@/modules/payments/payment.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

let tenant: { id: string }

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
}, 30_000)

afterAll(async () => closeSql())

describe('MP webhook idempotency under massive replay', () => {
  it('N=20 same mpEventId concurrent → exactly 1 fresh lock', async () => {
    const mpEventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const event = {
      mpEventId,
      eventType: 'payment',
      mpPaymentId: '111111111',
      rawPayload: { id: mpEventId, type: 'payment' },
    }

    const attempts = Array.from({ length: 20 }, () =>
      withTenantContext(tenant.id, (tx) => lockMpEvent(event, tx)),
    )
    const results = await Promise.all(attempts)
    const freshCount = results.filter((r) => r === true).length
    expect(freshCount).toBe(1)
    expect(results.filter((r) => r === false).length).toBe(19)

    const sql = getSql()
    const rows = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
    `
    expect(rows[0].c).toBe(1)
  }, 30_000)

  it('N=50 sequential replay → exactly 1 fresh, rest already processed', async () => {
    const mpEventId = `evt_seq_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const event = {
      mpEventId,
      eventType: 'payment',
      mpPaymentId: '222222222',
      rawPayload: { id: mpEventId, type: 'payment' },
    }

    let freshCount = 0
    for (let i = 0; i < 50; i++) {
      const r = await withTenantContext(tenant.id, (tx) => lockMpEvent(event, tx))
      if (r) freshCount++
    }
    expect(freshCount).toBe(1)
  }, 60_000)
})
