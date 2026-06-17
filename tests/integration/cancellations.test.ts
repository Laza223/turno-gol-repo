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
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  RefundUnavailableError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'

// Dinámica (hoy + 500 días): con fecha fija el test 4A se volvía out-of-policy
// cuando la fecha quedaba a menos de 9999h. Con +500 días, la policy de 9999h
// (~417 días) siempre da in-policy y la de 20000h (~833 días) siempre out-of-policy.
const FUTURE_DATE = new Date(Date.now() + 500 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

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

async function countAllBans(tenantId: string, playerId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c
    FROM tenant_player_bans
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `
  return Number(rows[0]!.c)
}

// Fetch the refund payment row so tests can assert the *amount* and *status*,
// not just "a row exists". A refund of the wrong amount (0, full price, …) must fail.
async function getRefundPayment(
  bookingId: string,
): Promise<{ amount: number; status: string } | undefined> {
  const sql = getSql()
  const rows = await sql<{ amount: string; status: string }[]>`
    SELECT amount::text AS amount, status
    FROM payments
    WHERE booking_id = ${bookingId} AND type = 'refund'
    LIMIT 1
  `
  const r = rows[0]
  return r ? { amount: Number(r.amount), status: r.status } : undefined
}

// Cancellation audit columns on the booking row itself (separate from audit_logs).
async function getBookingCancelMeta(
  bookingId: string,
): Promise<{ canceled_by: string | null; canceled_reason: string | null }> {
  const sql = getSql()
  const rows = await sql<{ canceled_by: string | null; canceled_reason: string | null }[]>`
    SELECT canceled_by, canceled_reason FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!
}

async function getLatestBan(
  tenantId: string,
  playerId: string,
): Promise<{ reason: string; banned_until: string | null; banned_by: string | null } | undefined> {
  const sql = getSql()
  const rows = await sql<
    Array<{ reason: string; banned_until: string | null; banned_by: string | null }>
  >`
    SELECT reason, banned_until, banned_by
    FROM tenant_player_bans
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
    ORDER BY banned_at DESC
    LIMIT 1
  `
  return rows[0]
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

    // Refund debe ser por el monto EXACTO de la seña (240_000 centavos), aprobado.
    // Aserción anterior (solo count===1) pasaba aunque el refund fuera por $0 o por el precio completo.
    const refund = await getRefundPayment(bookingId)
    expect(refund).toEqual({ amount: 240_000, status: 'approved' })
    expect(mockGateway.refundCalls).toContainEqual({ mpPaymentId, amount: 240_000 })

    // canceled_by / canceled_reason deben persistir en la fila del booking.
    expect(await getBookingCancelMeta(bookingId)).toEqual({
      canceled_by: 'player',
      canceled_reason: 'ya no puedo',
    })

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

    // Monto exacto del refund + gateway invocado con la seña, no con un valor arbitrario.
    expect(await getRefundPayment(bookingId)).toEqual({ amount: 240_000, status: 'approved' })
    expect(mockGateway.refundCalls).toContainEqual({ mpPaymentId, amount: 240_000 })
    expect(await getBookingCancelMeta(bookingId)).toEqual({
      canceled_by: 'admin',
      canceled_reason: 'mantenimiento',
    })

    const audits = await getAuditLogs(bookingId)
    const cancelAudit = audits.find((a) => a.action === 'booking.canceled_by_admin')
    expect(cancelAudit).toBeDefined()
    expect(cancelAudit!.actor_type).toBe('staff')
    // actor_id debe ser el staff real, no cualquier valor truthy.
    expect(cancelAudit!.actor_id).toBe(staff.id)
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

    // El ban debe tener fecha futura (ban_days=1) y registrar quién/por qué.
    const ban = await getLatestBan(tenant.id, player.id)
    expect(ban).toBeDefined()
    expect(ban!.banned_by).toBe(staff.id)
    expect(ban!.reason).toContain('no-show')
    expect(ban!.banned_until).not.toBeNull()
    expect(new Date(ban!.banned_until!).getTime()).toBeGreaterThan(Date.now())

    // handleNoShow también debe dejar audit log del no-show (no solo del ban).
    const audits = await getAuditLogs(bookingId)
    expect(audits.some((a) => a.action === 'booking.marked_no_show')).toBe(true)
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

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await cancelByAdmin(bookingId, staff.id, 'test', false, null, tx)
      }),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
  })
})

// ════════════════════════════════════════════════════════════════════
// GAPS AÑADIDOS POR LA AUDITORÍA
// ════════════════════════════════════════════════════════════════════

// ─── GAP A (CRÍTICO/IDOR): ownership guard de cancelByPlayer ──────────
// La protección IDOR existe en prod (BookingNotOwnedByPlayerError, ver
// mis-reservas/actions.ts) pero NUNCA estaba testeada. Sin este test, borrar
// la línea `if (b.player_id !== playerId) throw …` deja pasar la suite verde
// mientras un jugador cancela reservas de OTRO jugador.
describe('cancelByPlayer — ownership guard (IDOR)', () => {
  it('rechaza cancelación cuando el booking pertenece a otro jugador y no toca nada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestPlayer(sql)
    const attacker = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999) // in-policy → refundaría si pasara el guard

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: owner.id,
      date: FUTURE_DATE,
      timeStart: '07:00',
      timeEnd: '08:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-idor-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id,
      bookingId,
      playerId: owner.id,
      amount: 240_000,
      mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelByPlayer(bookingId, attacker.id, 'no es mía', mockGateway, tx),
      ),
    ).rejects.toBeInstanceOf(BookingNotOwnedByPlayerError)

    // Booking del dueño intacto; sin refund contra la cuenta del dueño.
    expect(await getBookingStatus(bookingId)).toBe('confirmed')
    expect(await getBookingDepositStatus(bookingId)).toBe('paid')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    expect(mockGateway.refundCalls.some((c) => c.mpPaymentId === mpPaymentId)).toBe(false)
  })
})

// ─── GAP B: cancelByPlayer sobre booking no-confirmado / inexistente ──
// Sólo se testeaba el guard de estado terminal por el lado admin. El lado
// jugador (cancelByPlayer) tenía el mismo guard sin cobertura.
describe('cancelByPlayer — state guard', () => {
  it('rechaza cancelar un booking ya cancelado (no-confirmado)', async () => {
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
      timeStart: '06:00',
      timeEnd: '07:00',
    })
    // confirmed → canceled_no_refund es transición válida en DB (terminal).
    await sql`UPDATE bookings SET status = 'canceled_no_refund' WHERE id = ${bookingId}`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelByPlayer(bookingId, player.id, 'doble click', mockGateway, tx),
      ),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)

    // Estado terminal preservado (sin re-escritura a otro canceled_*).
    expect(await getBookingStatus(bookingId)).toBe('canceled_no_refund')
  })

  it('rechaza cancelar un booking inexistente', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const ghostId = '00000000-0000-0000-0000-0000000000aa'

    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelByPlayer(ghostId, player.id, undefined, mockGateway, tx),
      ),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)
  })
})

// ─── GAP E/F/G: ramas faltantes de la penalización por no-show ────────
describe('handleNoShow — penalty branches', () => {
  it('no banea por debajo del umbral (1er no-show, threshold=3)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantNoShowPenalty(tenant.id, { type: 'ban_days', days: 1, threshold: 3 })

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '06:00', timeEnd: '07:00',
    })
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${bookingId}`

    await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))

    expect(await getBookingStatus(bookingId)).toBe('no_show')
    expect(await countAllBans(tenant.id, player.id)).toBe(0)
  })

  it('no banea cuando la penalización es type=none aunque supere el umbral', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantNoShowPenalty(tenant.id, { type: 'none', days: 0, threshold: 3 })

    // 2 no-shows previos + el 3ro vía handleNoShow ⇒ count=3 ≥ threshold.
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        price_snapshot, deposit_amount, deposit_status, status
      ) VALUES
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 5, '06:00'::time, '07:00'::time, 800000, 0, 'not_required', 'no_show'),
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 3, '07:00'::time, '08:00'::time, 800000, 0, 'not_required', 'no_show')
    `
    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '08:00', timeEnd: '09:00',
    })
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${bookingId}`

    await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))

    expect(await getBookingStatus(bookingId)).toBe('no_show')
    expect(await countAllBans(tenant.id, player.id)).toBe(0)
  })

  it('no crea un 2do ban mientras el primero sigue activo (idempotencia)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantNoShowPenalty(tenant.id, { type: 'ban_days', days: 30, threshold: 3 })

    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        price_snapshot, deposit_amount, deposit_status, status
      ) VALUES
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 6, '06:00'::time, '07:00'::time, 800000, 0, 'not_required', 'no_show'),
        (${tenant.id}, ${courtId}, ${player.id}, CURRENT_DATE - 5, '07:00'::time, '08:00'::time, 800000, 0, 'not_required', 'no_show')
    `
    // 3er no-show → primer ban (activo 30 días).
    const b1 = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '08:00', timeEnd: '09:00',
    })
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${b1}`
    await withTenantContext(tenant.id, (tx) => handleNoShow(b1, staff.id, tx))
    expect(await countActiveBans(tenant.id, player.id)).toBe(1)

    // 4to no-show con el ban TODAVÍA activo → no debe duplicar el ban.
    const b2 = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '09:00', timeEnd: '10:00',
    })
    await sql`UPDATE bookings SET date = CURRENT_DATE - INTERVAL '1 day' WHERE id = ${b2}`
    await withTenantContext(tenant.id, (tx) => handleNoShow(b2, staff.id, tx))

    expect(await getBookingStatus(b2)).toBe('no_show')
    expect(await countActiveBans(tenant.id, player.id)).toBe(1)
    expect(await countAllBans(tenant.id, player.id)).toBe(1)
  })
})

// ─── HALLAZGOS LATENTES (tests skip = especificación del fix) ─────────
// Codifican el comportamiento CORRECTO esperado. Hoy fallarían porque el
// código de prod tiene el gap. Quitar `.skip` cuando se aplique el fix.
describe('cancelByAdmin — inactive tenant guard (H8, paridad con cancelByPlayer)', () => {
  it('rechaza cancel+refund cuando el tenant está blocked y no toca el refund', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '05:00', timeEnd: '06:00',
      depositStatus: 'paid', depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-admin-blocked-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id, bookingId, playerId: player.id, amount: 240_000, mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)
    await sql`UPDATE tenants SET status = 'blocked' WHERE id = ${tenant.id}`

    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelByAdmin(bookingId, staff.id, 'x', true, mockGateway, tx),
      ),
    ).rejects.toBeInstanceOf(TenantInactiveError)
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
  })
})

// ─── Hallazgo 2 (FIX): in-policy + seña paga sin refund MP ejecutable ──
describe('cancelByPlayer — in-policy con seña paga y refund no auto-ejecutable', () => {
  it('seña MP pagada pero gateway no disponible → lanza RefundUnavailableError sin tocar nada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999) // in-policy

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '04:00', timeEnd: '05:00',
      depositStatus: 'paid', depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-nogw-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id, bookingId, playerId: player.id, amount: 240_000, mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId) // seña MP (payment_id seteado)

    // gateway = null simula token MP delinkeado: no se puede refundar.
    await expect(
      withTenantContext(tenant.id, (tx) =>
        cancelByPlayer(bookingId, player.id, undefined, null, tx),
      ),
    ).rejects.toBeInstanceOf(RefundUnavailableError)

    // Estado consistente: nada cambió. No hay booking "refunded" con plata atrapada.
    expect(await getBookingStatus(bookingId)).toBe('confirmed')
    expect(await getBookingDepositStatus(bookingId)).toBe('paid')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
  })

  it('seña en efectivo (sin payment_id MP) → canceled_refunded + deposit refunded sin refund MP', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999) // in-policy

    // Seña paga sin payment_id MP (efectivo/transferencia): reembolso offline.
    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '03:00', timeEnd: '04:00',
      depositStatus: 'paid', depositAmount: 240_000,
    })

    await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, 'me arrepentí', null, tx),
    )

    // Sin payment_id MP no hay refund automático, pero el booking queda consistente:
    // canceled_refunded + deposit 'refunded' (obligación offline), nunca 'paid'.
    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await getBookingDepositStatus(bookingId)).toBe('refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    expect(await countCashFlows(bookingId)).toBe(0)
  })
})
