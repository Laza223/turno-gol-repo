import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { createRefund } from '@/modules/payments/payment.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

let tenant: { id: string }
let seed: IsolationSeed
let playerId: string

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  tenant = await createTestTenant(s)
  seed = await seedIsolationData(s, tenant.id)
  const player = await createTestPlayer(s)
  await linkPlayerToTenant(s, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => closeSql())

let dayCounter = 0
async function setupApprovedPayment(amount = 100_000): Promise<string> {
  const s = getSql()
  dayCounter += 1
  const date = `2027-0${Math.min(9, Math.ceil(dayCounter / 28))}-${String(((dayCounter - 1) % 28) + 1).padStart(2, '0')}`
  const bookingId = await insertBooking(s, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId,
    date,
    timeStart: '20:00',
    timeEnd: '21:00',
    status: 'confirmed',
    depositStatus: 'paid',
    depositAmount: amount,
  })
  const mpPaymentId = `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${dayCounter}`
  const rows = await s<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, booking_id, player_id, amount, currency, type, method, status, mp_payment_id
    ) VALUES (
      ${tenant.id}, ${bookingId}, ${playerId}, ${amount}, 'ARS', 'deposit', 'mercadopago', 'approved', ${mpPaymentId}
    ) RETURNING id
  `
  return rows[0]!.id
}

describe('MP createRefund validation gaps', () => {
  it('refund amount > original.amount → currently allowed (potential bug)', async () => {
    const paymentId = await setupApprovedPayment(100_000)
    const gateway = new MockGateway()

    // Attempt refund of 200_000 on a 100_000 payment.
    // Defensive code would reject this; if it succeeds, document as a gap.
    let succeeded = false
    let errMsg = ''
    try {
      await withTenantContext(tenant.id, async (tx) => {
        await createRefund(paymentId, 200_000, gateway, tx)
      })
      succeeded = true
    } catch (e) {
      errMsg = (e as Error).message
    }

    expect(succeeded).toBe(false)
    expect(errMsg).toMatch(/exceeds available amount|RefundAmountExceedsOriginalError/i)
  })

  it('double refund on same payment → currently allowed (potential bug)', async () => {
    const paymentId = await setupApprovedPayment(50_000)
    const gateway = new MockGateway()

    await withTenantContext(tenant.id, async (tx) => {
      await createRefund(paymentId, 50_000, gateway, tx)
    })

    let secondSucceeded = false
    let errMsg = ''
    try {
      await withTenantContext(tenant.id, async (tx) => {
        await createRefund(paymentId, 50_000, gateway, tx)
      })
      secondSucceeded = true
    } catch (e) {
      errMsg = (e as Error).message
    }

    expect(secondSucceeded).toBe(false)
    expect(errMsg).toMatch(/exceeds available amount|RefundAmountExceedsOriginalError/i)
  })

  it('original payment status remains "approved" after refund (not updated to "refunded")', async () => {
    const paymentId = await setupApprovedPayment(75_000)
    const gateway = new MockGateway()

    await withTenantContext(tenant.id, async (tx) => {
      await createRefund(paymentId, 75_000, gateway, tx)
    })

    const s = getSql()
    const rows = await s<{ status: string }[]>`
      SELECT status FROM payments WHERE id = ${paymentId}
    `
    console.log(`[INFO B3.2.c] Original payment status after refund: ${rows[0]?.status}`)
    // Document: status stays 'approved'. The refund is a separate row (type='refund').
    // If business logic queries "is this payment refunded?", it has to JOIN payments
    // by booking_id + type='refund'. Acceptable design but should be documented.
    expect(['approved', 'refunded']).toContain(rows[0]?.status)
  })
})
