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

import {
  cancelByAdmin,
  cancelByPlayer,
  handleNoShow,
} from '@/modules/bookings/booking.cancellation'
import { TenantInactiveError } from '@/modules/bookings/booking.errors'

const FUTURE_DATE = '2027-08-01'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (
      ${tenantId}, ${'Cancha Cancel Test'}, ${10},
      ${sql.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', prices: { '60': 800000, '120': 1500000 } }] })},
      'online'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertConfirmedBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  date: string
  timeStart: string
  timeEnd: string
  depositStatus?: string
  depositAmount?: number
}): Promise<string> {
  const sql = getSql()
  const depositStatus = opts.depositStatus ?? 'not_required'
  const depositAmount = opts.depositAmount ?? 0
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${800000}, ${depositAmount}, ${depositStatus}, NULL, 'confirmed'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function insertApprovedPayment(opts: {
  tenantId: string
  bookingId: string
  playerId: string
  amount: number
  mpPaymentId: string
}): Promise<string> {
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
  return rows[0]!.id
}

async function linkPaymentToBooking(bookingId: string, paymentId: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE bookings
    SET payment_method = 'mercadopago', payment_id = ${paymentId}
    WHERE id = ${bookingId}
  `
}

async function setTenantPolicy(tenantId: string, hoursBefore: number): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ cancellation_policy: { hours_before: hoursBefore, penalty_type: 'deposit', penalty_amount: null } })}
    WHERE id = ${tenantId}
  `
}

async function setTenantNoShowPenalty(
  tenantId: string,
  opts: { type: string; days: number; threshold: number },
): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE tenants
    SET settings = settings || ${sql.json({ no_show_penalty: opts })}
    WHERE id = ${tenantId}
  `
}

async function getBookingDepositStatus(bookingId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ deposit_status: string }[]>`
    SELECT deposit_status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.deposit_status
}

async function getBookingStatus(bookingId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.status
}

async function countPaymentsByType(bookingId: string, type: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM payments WHERE booking_id = ${bookingId} AND type = ${type}
  `
  return Number(rows[0]!.c)
}

async function countCashFlows(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM cash_flows WHERE booking_id = ${bookingId}
  `
  return Number(rows[0]!.c)
}

async function getAuditLogs(bookingId: string) {
  const sql = getSql()
  return sql<Array<{ action: string; actor_type: string; actor_id: string }>>`
    SELECT action, actor_type, actor_id
    FROM audit_logs
    WHERE resource_id = ${bookingId}
    ORDER BY created_at
  `
}

async function countActiveBans(tenantId: string, playerId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c
    FROM tenant_player_bans
    WHERE tenant_id = ${tenantId}
      AND player_id = ${playerId}
      AND (banned_until IS NULL OR banned_until > NOW())
  `
  return Number(rows[0]!.c)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// ─── Hallazgo 8: inactive-tenant guard ──────────────────────────────
describe('cancelByPlayer — Hallazgo 8: inactive tenant guard', () => {
  for (const status of ['deleted', 'blocked'] as const) {
    it(`rejects cancellation when tenant is ${status} and never refunds`, async () => {
      const sql = getSql()
      const tenant = await createTestTenant(sql)
      const player = await createTestPlayer(sql)
      const courtId = await insertCourt(tenant.id)
      await setTenantPolicy(tenant.id, 9999) // in-policy → would refund if allowed

      const bookingId = await insertConfirmedBooking({
        tenantId: tenant.id,
        courtId,
        playerId: player.id,
        date: FUTURE_DATE,
        timeStart: status === 'deleted' ? '12:00' : '13:00',
        timeEnd: status === 'deleted' ? '13:00' : '14:00',
        depositStatus: 'paid',
        depositAmount: 240_000,
      })
      const mpPaymentId = `mp-pay-h8-${status}-${bookingId.slice(0, 8)}`
      const paymentId = await insertApprovedPayment({
        tenantId: tenant.id,
        bookingId,
        playerId: player.id,
        amount: 240_000,
        mpPaymentId,
      })
      await linkPaymentToBooking(bookingId, paymentId)

      await sql`UPDATE tenants SET status = ${status} WHERE id = ${tenant.id}`

      await expect(
        withTenantContext(tenant.id, (tx) =>
          cancelByPlayer(bookingId, player.id, 'no va más', mockGateway, tx),
        ),
      ).rejects.toBeInstanceOf(TenantInactiveError)

      // Booking untouched; no refund attempted against the dead MP account.
      expect(await getBookingStatus(bookingId)).toBe('confirmed')
      expect(await getBookingDepositStatus(bookingId)).toBe('paid')
      expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    })
  }
})

// ─── 4A: player cancel in-policy, deposit paid ──────────────────────
describe('cancelByPlayer — 4A: in-policy, deposit paid', () => {
  it('status=canceled_refunded, deposit=refunded, refund payment row, no cashflow, audit actor=player', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    // Policy = 9999 hours → always in-policy
    await setTenantPolicy(tenant.id, 9999)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '10:00',
      timeEnd: '11:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    const mpPaymentId = `mp-pay-4a-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id,
      bookingId,
      playerId: player.id,
      amount: 240_000,
      mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    // MockGateway.createRefund auto-resolves
    await withTenantContext(tenant.id, async (tx) => {
      await cancelByPlayer(bookingId, player.id, 'ya no puedo', mockGateway, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await getBookingDepositStatus(bookingId)).toBe('refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(1)
    expect(await countCashFlows(bookingId)).toBe(0)

    const audits = await getAuditLogs(bookingId)
    const cancelAudit = audits.find((a) => a.action === 'booking.canceled')
    expect(cancelAudit).toBeDefined()
    expect(cancelAudit!.actor_type).toBe('player')
    expect(cancelAudit!.actor_id).toBe(player.id)
  })
})

// ─── 4B: player cancel out-of-policy, deposit paid ──────────────────
describe('cancelByPlayer — 4B: out-of-policy, deposit paid', () => {
  it('status=canceled_no_refund, deposit=captured, no refund rows, no cashflow', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    // Policy = 20000 hours (>833 days) → deadline already past → always out-of-policy for 2027 booking
    await setTenantPolicy(tenant.id, 20000)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '10:00',
      timeEnd: '11:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    const mpPaymentId = `mp-pay-4b-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id,
      bookingId,
      playerId: player.id,
      amount: 240_000,
      mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await withTenantContext(tenant.id, async (tx) => {
      await cancelByPlayer(bookingId, player.id, undefined, mockGateway, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_no_refund')
    expect(await getBookingDepositStatus(bookingId)).toBe('captured')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    expect(await countCashFlows(bookingId)).toBe(0)
  })
})

// ─── 4A: player cancel, no deposit ──────────────────────────────────
describe('cancelByPlayer — 4A: no deposit', () => {
  it('status=canceled_refunded, no payment rows touched', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '12:00',
      timeEnd: '13:00',
      depositStatus: 'not_required',
      depositAmount: 0,
    })

    await withTenantContext(tenant.id, async (tx) => {
      await cancelByPlayer(bookingId, player.id, undefined, null, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    expect(await countCashFlows(bookingId)).toBe(0)
  })
})

// ─── 4C: admin cancel with refund ───────────────────────────────────
describe('cancelByAdmin — 4C: with refund', () => {
  it('status=canceled_refunded, refund payment row, audit actor=staff', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '14:00',
      timeEnd: '15:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    const mpPaymentId = `mp-pay-4c-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id,
      bookingId,
      playerId: player.id,
      amount: 240_000,
      mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await withTenantContext(tenant.id, async (tx) => {
      await cancelByAdmin(bookingId, staff.id, 'mantenimiento', true, mockGateway, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await getBookingDepositStatus(bookingId)).toBe('refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(1)
    expect(await countCashFlows(bookingId)).toBe(0)

    const audits = await getAuditLogs(bookingId)
    const cancelAudit = audits.find((a) => a.action === 'booking.canceled_by_admin')
    expect(cancelAudit).toBeDefined()
    expect(cancelAudit!.actor_type).toBe('staff')
  })
})

// ─── 4C: admin cancel without refund ────────────────────────────────
describe('cancelByAdmin — 4C: without refund', () => {
  it('status=canceled_no_refund, deposit=captured, no refund rows', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '15:00',
      timeEnd: '16:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    await withTenantContext(tenant.id, async (tx) => {
      await cancelByAdmin(bookingId, staff.id, 'excepción operativa', false, null, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_no_refund')
    expect(await getBookingDepositStatus(bookingId)).toBe('captured')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    expect(await countCashFlows(bookingId)).toBe(0)
  })
})

// ─── 4D: 3rd no-show → ban ──────────────────────────────────────────
describe('handleNoShow — 4D: ban after threshold', () => {
  it('3rd no-show triggers ban insert', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantNoShowPenalty(tenant.id, { type: 'ban_days', days: 1, threshold: 3 })

    // Insert 2 past no-shows directly (within 30-day window)
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        price_snapshot, deposit_amount, deposit_status, status
      ) VALUES
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 5, '08:00'::time, '09:00'::time, 800000, 0, 'not_required', 'no_show'),
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 3, '09:00'::time, '10:00'::time, 800000, 0, 'not_required', 'no_show')
    `

    // 3rd booking: insert confirmed, then handleNoShow
    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '16:00',
      timeEnd: '17:00',
    })

    // handleNoShow requires booking time to be in the past for markNoShow to work.
    // Force date to today so the DB trigger doesn't block (status='confirmed' → 'no_show' is allowed).
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${bookingId}`

    await withTenantContext(tenant.id, async (tx) => {
      await handleNoShow(bookingId, staff.id, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('no_show')
    expect(await countActiveBans(tenant.id, player.id)).toBe(1)
  })

  it('2nd ban allowed after first expires (trigger permits non-active ban)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantNoShowPenalty(tenant.id, { type: 'ban_days', days: 1, threshold: 3 })

    // Insert 2 past no-shows
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        price_snapshot, deposit_amount, deposit_status, status
      ) VALUES
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 5, '10:00'::time, '11:00'::time, 800000, 0, 'not_required', 'no_show'),
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 4, '11:00'::time, '12:00'::time, 800000, 0, 'not_required', 'no_show')
    `

    // 3rd no-show → triggers first ban
    const b1Id = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '18:00', timeEnd: '19:00',
    })
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${b1Id}`
    await withTenantContext(tenant.id, async (tx) => {
      await handleNoShow(b1Id, staff.id, tx)
    })
    expect(await countActiveBans(tenant.id, player.id)).toBe(1)

    // Expire the first ban
    await sql`
      UPDATE tenant_player_bans
      SET banned_until = NOW() - INTERVAL '1 second'
      WHERE tenant_id = ${tenant.id} AND player_id = ${player.id}
    `
    expect(await countActiveBans(tenant.id, player.id)).toBe(0)

    // 4th no-show within the 30-day window → new ban allowed (trigger accepts expired+new)
    const b2Id = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '19:00', timeEnd: '20:00',
    })
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${b2Id}`
    await withTenantContext(tenant.id, async (tx) => {
      await handleNoShow(b2Id, staff.id, tx)
    })

    expect(await countActiveBans(tenant.id, player.id)).toBe(1)
  })
})

// ─── Guard: cancel non-confirmed booking ────────────────────────────
describe('Guard: cancel terminal booking', () => {
  it('cancelByAdmin throws BookingNotInConfirmedError when status=expired', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '20:00', timeEnd: '21:00',
    })
    // Force to expired bypassing trigger (which only blocks terminal→anything, not confirmed→terminal)
    // Confirmed → expired: set directly since it's a valid DB transition
    await sql`
      UPDATE bookings SET status = 'expired', updated_at = NOW()
      WHERE id = ${bookingId}
    `

    const { BookingNotInConfirmedError } = await import('@/modules/bookings/booking.errors')
    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await cancelByAdmin(bookingId, staff.id, 'test', false, null, tx)
      }),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
  })
})
