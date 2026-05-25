import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-oauth', async () => {
  const actual = await vi.importActual<typeof import('@/modules/payments/mp-oauth')>(
    '@/modules/payments/mp-oauth',
  )
  return {
    ...actual,
    resolveTenantGateway: () => mockGateway,
  }
})

const sendEmailSpy = vi.fn(async (_id: string) => {})
vi.mock('@/modules/notifications/notification.service', async () => {
  const actual = await vi.importActual<typeof import('@/modules/notifications/notification.service')>(
    '@/modules/notifications/notification.service',
  )
  return {
    ...actual,
    dispatchEmail: async (id: string) => {
      await sendEmailSpy(id)
    },
  }
})

import { reconcilePendingPayments } from '@/shared/jobs/workers/reconcile-pending-payments.worker'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      prices: { '60': 800000, '120': 1500000 },
    },
  ],
}

const FUTURE_DATE = '2027-06-15'

async function setupReconcilableBooking() {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)

  await sql`
    UPDATE tenants SET mp_access_token = ${'dummy-encrypted-token'} WHERE id = ${tenant.id}
  `

  const [{ id: courtId }] = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenant.id}, ${'Cancha Reconcile'}, 10, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `

  const [{ id: bookingId }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status, created_at
    )
    VALUES (
      ${tenant.id}, ${courtId}, ${player.id},
      ${FUTURE_DATE}::date, '20:00'::time, '21:00'::time,
      800000, 240000, 'pending', NULL, 'pending_payment',
      NOW() - INTERVAL '10 minutes'
    )
    RETURNING id
  `

  await sql`
    INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method, status, mp_preference_id)
    VALUES (
      ${tenant.id}, ${bookingId}, ${player.id},
      240000, 'deposit', 'mercadopago', 'pending', ${'pref-' + bookingId}
    )
  `

  return { tenantId: tenant.id, bookingId, playerId: player.id }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(() => {
  mockGateway.statusCalls = []
  mockGateway.searchCalls = []
  mockGateway.searchResults = {}
  sendEmailSpy.mockClear()
})

afterAll(async () => closeSql())

describe('reconcile-pending-payments idempotency', () => {
  it('concurrent N=5 invocations on same stuck booking → exactly 1 confirm + 1 processed_webhooks row', async () => {
    const { tenantId, bookingId } = await setupReconcilableBooking()
    const mpPaymentId = `mp-pay-${bookingId.slice(0, 8)}`

    mockGateway.searchResults[bookingId] = [
      {
        mpPaymentId,
        status: 'approved',
        amount: 240000,
        externalReference: bookingId,
        paymentMethodId: 'account_money',
      },
    ]

    const results = await Promise.all(
      Array.from({ length: 5 }, () => reconcilePendingPayments()),
    )

    const total = results.reduce((acc, n) => acc + n, 0)
    expect(total).toBe(1)

    const sql = getSql()
    const [booking] = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(booking.status).toBe('confirmed')

    const [pwhCount] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks
      WHERE mp_event_id = ${'reconcile-' + mpPaymentId}
    `
    expect(pwhCount.c).toBe(1)

    // 2 payment rows by design: original "preference" row (mp_payment_id NULL)
    // + new "approved" row (mp_payment_id set). UPSERT on mp_payment_id ensures
    // no duplicate approved rows even under concurrent reconcile.
    const [approvedCount] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM payments
      WHERE booking_id = ${bookingId} AND mp_payment_id = ${mpPaymentId}
    `
    expect(approvedCount.c).toBe(1)

    // Approved-happy-path emits 0 notificationIds from dispatchPaymentInfo
    // (player confirmation is enqueued by transitionFromPendingPayment elsewhere).
    // Late-payment alerts (won=false + terminal) WOULD be in notificationIds —
    // we assert no late-payment audit row created on the happy path.
    const [lateAttempts] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM audit_logs
      WHERE resource_id = ${bookingId} AND action = 'booking.late_payment_attempt'
    `
    expect(lateAttempts.c).toBe(0)
    expect(tenantId).toBeDefined()
  }, 30_000)

  it('sequential reconcile after real webhook already processed → no double effect', async () => {
    const { tenantId, bookingId } = await setupReconcilableBooking()
    const mpPaymentId = `mp-pay-real-${bookingId.slice(0, 8)}`

    mockGateway.searchResults[bookingId] = [
      {
        mpPaymentId,
        status: 'approved',
        amount: 240000,
        externalReference: bookingId,
        paymentMethodId: 'account_money',
      },
    ]

    // First reconcile confirms.
    const first = await reconcilePendingPayments()
    expect(first).toBe(1)

    sendEmailSpy.mockClear()

    // Second reconcile sees same approved payment; booking already confirmed.
    const second = await reconcilePendingPayments()
    expect(second).toBe(0)

    const sql = getSql()
    const [booking] = await sql<{ status: string }[]>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `
    expect(booking.status).toBe('confirmed')

    // No new email dispatched on second pass (would only fire late_payment_attempt
    // for terminal states; confirmed is not terminal-after-confirmation in this flow).
    expect(sendEmailSpy).not.toHaveBeenCalled()

    // Only 1 processed_webhooks row for the reconcile event.
    const [pwhCount] = await sql<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks
      WHERE mp_event_id = ${'reconcile-' + mpPaymentId}
    `
    expect(pwhCount.c).toBe(1)
    expect(tenantId).toBeDefined()
  }, 30_000)
})
