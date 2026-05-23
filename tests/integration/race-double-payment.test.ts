import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

// Stub the MP SDK so getPaymentStatus returns a deterministic "approved".
vi.mock('@/modules/payments/mp-gateway.implementation', () => ({
  MercadoPagoGateway: class {
    constructor(_: string) {}
    async getPaymentStatus(id: string) {
      return {
        mpPaymentId: id,
        status: 'approved' as const,
        amount: 100000,
        externalReference: ((globalThis as Record<string, unknown>).__BOOKING_ID__ as string) ?? '',
        paymentMethodId: 'account_money',
      }
    }
  },
}))

import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'

let tenant: { id: string }
let seed: IsolationSeed
let bookingId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  bookingId = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: player.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 100000,
  })
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'enc:fake'}
    WHERE id = ${tenant.id}
  `
  ;(globalThis as Record<string, unknown>).__BOOKING_ID__ = bookingId
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('race: webhook storm', () => {
  it('M=8 concurrent identical webhooks → 1 transition, 1 payment, 1 event', async () => {
    const M = 8
    const jobs = Array.from({ length: M }, () => ({
      tenantId: tenant.id,
      mpEventId: 'evt-race-1',
      eventType: 'payment',
      mpPaymentId: '999000111',
      rawPayload: { id: 'evt-race-1', type: 'payment', data: { id: '999000111' } },
    }))

    const results = await Promise.allSettled(jobs.map((j) => handleMpWebhookJob(j)))
    const rejected = results.filter((r) => r.status === 'rejected').length
    expect(rejected).toBeLessThanOrEqual(M)

    const sql = getSql()
    const bk = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(bk[0].status).toBe('confirmed')

    const pays = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM payments WHERE mp_payment_id = '999000111'
    `
    expect(pays[0].c).toBe(1)

    const cfs = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c
      FROM cash_flows
      WHERE tenant_id = ${tenant.id}
        AND description LIKE '%999000111%'
    `
    expect(cfs[0].c).toBeLessThanOrEqual(1)

    const evt = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks WHERE mp_event_id = 'evt-race-1'
    `
    expect(evt[0].c).toBe(1)
  }, 30_000)
})
