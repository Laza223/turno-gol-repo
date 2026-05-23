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

// Gateway returns a payment whose external_reference is tenant B's booking.
vi.mock('@/modules/payments/mp-gateway.implementation', () => ({
  MercadoPagoGateway: class {
    constructor(_: string) {}
    async getPaymentStatus(id: string) {
      return {
        mpPaymentId: id,
        status: 'approved' as const,
        amount: 100000,
        externalReference: ((globalThis as Record<string, unknown>).__BOOKING_OF_B__ as string) ?? '',
        paymentMethodId: 'account_money',
      }
    }
  },
}))

import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'

let tenantA: { id: string }
let tenantB: { id: string }
let bookingOfB: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)
  const A: IsolationSeed = await seedIsolationData(sql, tenantA.id)
  const B: IsolationSeed = await seedIsolationData(sql, tenantB.id)
  void A
  const playerB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantB.id, playerB.id)
  bookingOfB = await insertBooking(sql, {
    tenantId: tenantB.id,
    courtId: B.courtId,
    playerId: playerB.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'pending_payment',
    depositStatus: 'pending',
    depositAmount: 100000,
  })
  await sql`UPDATE tenants SET mp_access_token = ${'enc:fake'} WHERE id = ${tenantA.id}`
  ;(globalThis as Record<string, unknown>).__BOOKING_OF_B__ = bookingOfB
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('webhook tenant cross-check', () => {
  it('rejects a webhook claiming tenant A for a payment bound to tenant B', async () => {
    await expect(
      handleMpWebhookJob({
        tenantId: tenantA.id,
        mpEventId: 'evt-cross-1',
        eventType: 'payment',
        mpPaymentId: '888000222',
        rawPayload: { id: 'evt-cross-1', type: 'payment', data: { id: '888000222' } },
      }),
    ).rejects.toThrow(/tenant mismatch/i)

    const sql = getSql()
    // No payment row created for the spoofed event.
    const pays = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM payments WHERE mp_payment_id = '888000222'
    `
    expect(pays[0].c).toBe(0)

    // Booking B unchanged.
    const bk = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingOfB}
    `
    expect(bk[0].status).toBe('pending_payment')
  }, 30_000)
})
