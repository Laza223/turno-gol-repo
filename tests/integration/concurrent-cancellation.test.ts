import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const mockGateway = new MockGateway()

vi.mock('@/modules/payments/mp-gateway.implementation', () => {
  return {
    MercadoPagoGateway: class {
      constructor(_encryptedAccessToken: string) {}
      createPreference = (...args: Parameters<MockGateway['createPreference']>) =>
        mockGateway.createPreference(...args)
      getPaymentStatus = (...args: Parameters<MockGateway['getPaymentStatus']>) =>
        mockGateway.getPaymentStatus(...args)
      createRefund = (...args: Parameters<MockGateway['createRefund']>) =>
        mockGateway.createRefund(...args)
    },
  }
})

import { cancelByAdmin, cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { expirePendingBooking } from '@/modules/bookings/booking.service'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'

const FUTURE_DATE = '2027-09-01'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Stress'}, ${10},
      ${sql.json({ rules: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], from: '08:00', to: '23:00', prices: { '60': 800000, '120': 1500000 } }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  timeStart: string
  timeEnd: string
  status: 'confirmed' | 'pending_payment'
  depositStatus: string
  depositAmount: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${800000}, ${opts.depositAmount}, ${opts.depositStatus}, NULL, ${opts.status}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertApprovedPaymentAndLink(opts: {
  tenantId: string
  bookingId: string
  playerId: string
  amount: number
  mpPaymentId: string
}): Promise<void> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO payments (
      tenant_id, booking_id, player_id, amount, currency,
      type, method, status, mp_payment_id, processed_at
    )
    VALUES (
      ${opts.tenantId}, ${opts.bookingId}, ${opts.playerId}, ${opts.amount}, 'ARS',
      'deposit', 'mercadopago', 'approved', ${opts.mpPaymentId}, NOW()
    )
    RETURNING id
  `
  await sql`
    UPDATE bookings SET payment_method = 'mercadopago', payment_id = ${rows[0]!.id}
    WHERE id = ${opts.bookingId}
  `
}

async function setInPolicy(tenantId: string): Promise<void> {
  const sql = getSql()
  // 9999 hours before → the 2027 booking is always inside the refund window.
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ cancellation_policy: { hours_before: 9999, penalty_type: 'deposit', penalty_amount: null } })}
    WHERE id = ${tenantId}
  `
}

async function getBooking(bookingId: string) {
  const sql = getSql()
  const rows = await sql<
    { status: string; deposit_status: string; canceled_by: string | null }[]
  >`
    SELECT status, deposit_status, canceled_by FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!
}

async function countRefundRows(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM payments WHERE booking_id = ${bookingId} AND type = 'refund'
  `
  return Number(rows[0]!.c)
}

async function countCancelAudits(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM audit_logs
    WHERE resource_id = ${bookingId}
      AND action IN ('booking.canceled', 'booking.canceled_by_admin')
  `
  return Number(rows[0]!.c)
}

let tenantId: string
let playerId: string
let staffId: string
let courtId: string
const refundSpy = vi.spyOn(mockGateway, 'createRefund')

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  tenantId = tenant.id
  playerId = player.id
  staffId = staff.id
  courtId = await insertCourt(tenant.id)
  await setInPolicy(tenant.id)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('concurrent cancellation — conditional transition lets exactly one win', () => {
  // admin cancel + player cancel + expiry job fired simultaneously on the SAME
  // confirmed booking. The FOR UPDATE lock serializes the two cancels so exactly
  // one wins; the expiry is a conditional UPDATE on status='pending_payment' and
  // no-ops. No side effect (refund, audit) may run twice. Repeated across rounds
  // to shake out timing-dependent duplicates.
  const ROUNDS = 5

  it(`only one cancellation wins; no duplicate refund/audit (x${ROUNDS})`, async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const hour = String(10 + i).padStart(2, '0')
      const bookingId = await insertBooking({
        tenantId,
        courtId,
        playerId,
        timeStart: `${hour}:00`,
        timeEnd: `${hour}:59`,
        status: 'confirmed',
        depositStatus: 'paid',
        depositAmount: 240_000,
      })
      const mpPaymentId = `mp-stress-${i}-${bookingId.slice(0, 8)}`
      await insertApprovedPaymentAndLink({
        tenantId,
        bookingId,
        playerId,
        amount: 240_000,
        mpPaymentId,
      })

      const [adminRes, playerRes, expiryRes] = await Promise.allSettled([
        withTenantContext(tenantId, (tx) =>
          cancelByAdmin(bookingId, staffId, 'admin cancela', true, mockGateway, tx),
        ),
        withTenantContext(tenantId, (tx) =>
          cancelByPlayer(bookingId, playerId, 'player cancela', mockGateway, tx),
        ),
        withTenantContext(tenantId, (tx) => expirePendingBooking(bookingId, tx)),
      ])

      // Exactly one of {admin, player} wins; the loser sees a non-confirmed row.
      const cancels = [adminRes, playerRes]
      const winners = cancels.filter((r) => r.status === 'fulfilled')
      const losers = cancels.filter((r) => r.status === 'rejected')
      expect(winners, `round ${i}: exactly one cancel should win`).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        BookingNotInConfirmedError,
      )

      // Expiry is a no-op on a confirmed booking.
      expect(expiryRes.status).toBe('fulfilled')
      if (expiryRes.status === 'fulfilled') {
        expect(expiryRes.value).toEqual({ won: false })
      }

      // Final state is a single, consistent cancellation with a refund.
      const booking = await getBooking(bookingId)
      expect(booking.status).toBe('canceled_refunded')
      expect(booking.deposit_status).toBe('refunded')
      expect(['admin', 'player']).toContain(booking.canceled_by)

      // No duplicated side effects.
      expect(await countRefundRows(bookingId), `round ${i}: one refund row`).toBe(1)
      expect(await countCancelAudits(bookingId), `round ${i}: one cancel audit`).toBe(1)
      const refundCallsForThisPayment = refundSpy.mock.calls.filter(
        (c) => c[0] === mpPaymentId,
      ).length
      expect(refundCallsForThisPayment, `round ${i}: gateway refunded once`).toBe(1)
    }
  }, 60_000)

  it('on a pending_payment booking, expiry wins and both cancels no-op', async () => {
    const bookingId = await insertBooking({
      tenantId,
      courtId,
      playerId,
      timeStart: '20:00',
      timeEnd: '20:59',
      status: 'pending_payment',
      depositStatus: 'pending',
      depositAmount: 240_000,
    })

    const [adminRes, playerRes, expiryRes] = await Promise.allSettled([
      withTenantContext(tenantId, (tx) =>
        cancelByAdmin(bookingId, staffId, 'admin', true, mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) =>
        cancelByPlayer(bookingId, playerId, 'player', mockGateway, tx),
      ),
      withTenantContext(tenantId, (tx) => expirePendingBooking(bookingId, tx)),
    ])

    // Neither cancel can act on a non-confirmed booking.
    expect(adminRes.status).toBe('rejected')
    expect(playerRes.status).toBe('rejected')
    expect((adminRes as PromiseRejectedResult).reason).toBeInstanceOf(BookingNotInConfirmedError)
    expect((playerRes as PromiseRejectedResult).reason).toBeInstanceOf(BookingNotInConfirmedError)

    // Expiry wins the conditional transition.
    expect(expiryRes.status).toBe('fulfilled')
    if (expiryRes.status === 'fulfilled') {
      expect(expiryRes.value.won).toBe(true)
    }

    const booking = await getBooking(bookingId)
    expect(booking.status).toBe('expired')
    expect(await countRefundRows(bookingId)).toBe(0)
    expect(await countCancelAudits(bookingId)).toBe(0)
  }, 30_000)
})
