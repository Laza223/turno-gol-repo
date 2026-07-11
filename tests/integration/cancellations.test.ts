import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { physicalRange } from '@/shared/time/physical-range'
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
import { settleRefund } from '@/modules/payments/payment.service'
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
      ${sql.json({ rules: [{ days: ['mon','tue','wed','thu','fri','sat','sun'], from: '08:00', to: '23:00', price: 800000 }] })},
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
  // Deuda Task 4 (migr. 041 NOT NULL): starts_at/ends_at ahora obligatorios.
  const { startsAt, endsAt } = physicalRange({
    date: opts.date,
    timeStart: opts.timeStart,
    timeEnd: opts.timeEnd,
    physicallyNextDay: false,
  })
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${startsAt.toISOString()}, ${endsAt.toISOString()},
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

async function getPlayerBalance(tenantId: string, playerId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ balance: number | null }[]>`
    SELECT balance FROM player_tenant_relationships
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
    LIMIT 1
  `
  return Number(rows[0]?.balance ?? 0)
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

// Lee el metadata del audit log de cancelación tal como lo consume la app.
// getAuditLogs solo trae action/actor, no el contenido del rastro.
//
// LATENTE (BUG #2): insertAuditLog escribe vía drizzle `.insert().values({metadata})`
// y el valor queda DOBLE-CODIFICADO en la columna jsonb (jsonb_typeof = 'string',
// p.ej. "{\"inPolicy\":true}"). Consecuencia: `metadata->>'inPolicy'` en SQL crudo
// devuelve NULL — el rastro no es consultable por campo. La app lo tolera
// parseando en lectura (parseAuditMetadata en super-admin/tenants.service.ts).
// Acá replicamos ese contrato real de lectura (parse-si-string) para fijar el
// CONTENIDO del rastro; la doble codificación se reporta como hallazgo aparte.
async function getCancelAuditMetadata(
  bookingId: string,
  action: string,
): Promise<Record<string, unknown> | undefined> {
  const sql = getSql()
  const rows = await sql<Array<{ metadata: unknown }>>`
    SELECT metadata
    FROM audit_logs
    WHERE resource_id = ${bookingId} AND action = ${action}
    ORDER BY created_at DESC
    LIMIT 1
  `
  const raw = rows[0]?.metadata
  if (raw == null) return undefined
  return typeof raw === 'string'
    ? (JSON.parse(raw) as Record<string, unknown>)
    : (raw as Record<string, unknown>)
}

async function getBookingCanceledAt(bookingId: string): Promise<string | null> {
  const sql = getSql()
  const rows = await sql<{ canceled_at: string | null }[]>`
    SELECT canceled_at FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.canceled_at
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

    // MockGateway.createRefund auto-resolves. prepareRefund solo deja la fila
    // 'pending' durable dentro de la tx (caza-bugs #3); settleRefund, después
    // del commit, llama a MP de verdad.
    const outcome = await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, 'ya no puedo', mockGateway, tx),
    )
    expect(outcome.pendingRefund).toBeDefined()
    await settleRefund(outcome.pendingRefund!, mockGateway, tenant.id)

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

// ─── 4C / Tarea #3: admin cancela "el complejo" → reembolso forzado ──
describe('cancelByAdmin — Tarea #3: complejo cancela → reembolso forzado', () => {
  it('in-policy: refund + canceled_reason con tipo + metadata cancellationType', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999) // in-policy

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

    const outcome = await withTenantContext(tenant.id, (tx) =>
      cancelByAdmin(bookingId, staff.id, 'mantenimiento', 'complejo', mockGateway, tx),
    )
    expect(outcome.pendingRefund).toBeDefined()
    await settleRefund(outcome.pendingRefund!, mockGateway, tenant.id)

    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await getBookingDepositStatus(bookingId)).toBe('refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(1)
    expect(await countCashFlows(bookingId)).toBe(0)

    expect(await getRefundPayment(bookingId)).toEqual({ amount: 240_000, status: 'approved' })
    expect(mockGateway.refundCalls).toContainEqual({ mpPaymentId, amount: 240_000 })
    // canceled_reason incluye el tipo de cancelación (Tarea #3).
    expect(await getBookingCancelMeta(bookingId)).toEqual({
      canceled_by: 'admin',
      canceled_reason: 'Cancelado por el complejo: mantenimiento',
    })
    // El rastro guarda el tipo de cancelación y el reason crudo.
    const meta = await getCancelAuditMetadata(bookingId, 'booking.canceled_by_admin')
    expect(meta).toMatchObject({ reason: 'mantenimiento', cancellationType: 'complejo', shouldRefund: true })

    const audits = await getAuditLogs(bookingId)
    const cancelAudit = audits.find((a) => a.action === 'booking.canceled_by_admin')
    expect(cancelAudit).toBeDefined()
    expect(cancelAudit!.actor_type).toBe('staff')
    expect(cancelAudit!.actor_id).toBe(staff.id)
  })

  it('FUERA de plazo: el complejo reembolsa igual (no es culpa del jugador)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 20000) // out-of-policy

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '16:00',
      timeEnd: '17:00',
      depositStatus: 'paid',
      depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-4c-oop-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id, bookingId, playerId: player.id, amount: 240_000, mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await withTenantContext(tenant.id, async (tx) => {
      await cancelByAdmin(bookingId, staff.id, 'cancha rota', 'complejo', mockGateway, tx)
    })

    // Aunque la política diría retener, el complejo reembolsa.
    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await getBookingDepositStatus(bookingId)).toBe('refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(1)
    const meta = await getCancelAuditMetadata(bookingId, 'booking.canceled_by_admin')
    expect(meta).toMatchObject({ cancellationType: 'complejo', inPolicy: false, shouldRefund: true })
  })
})

// ─── 4C / Tarea #3: admin cancela "el jugador" → política horaria ────
describe('cancelByAdmin — Tarea #3: jugador pidió cancelar → política', () => {
  it('DENTRO de plazo: reembolso por política', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999) // in-policy

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '15:00', timeEnd: '16:00',
      depositStatus: 'paid', depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-4c-jin-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id, bookingId, playerId: player.id, amount: 240_000, mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await withTenantContext(tenant.id, async (tx) => {
      await cancelByAdmin(bookingId, staff.id, 'no puede ir', 'jugador', mockGateway, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_refunded')
    expect(await getBookingDepositStatus(bookingId)).toBe('refunded')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(1)
    const meta = await getCancelAuditMetadata(bookingId, 'booking.canceled_by_admin')
    expect(meta).toMatchObject({ cancellationType: 'jugador', inPolicy: true, shouldRefund: true })
  })

  it('FUERA de plazo: sin reembolso, seña capturada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 20000) // out-of-policy

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
      await cancelByAdmin(bookingId, staff.id, 'avisó tarde', 'jugador', null, tx)
    })

    expect(await getBookingStatus(bookingId)).toBe('canceled_no_refund')
    expect(await getBookingDepositStatus(bookingId)).toBe('captured')
    expect(await countPaymentsByType(bookingId, 'refund')).toBe(0)
    expect(await countCashFlows(bookingId)).toBe(0)
    expect(await getBookingCancelMeta(bookingId)).toEqual({
      canceled_by: 'admin',
      canceled_reason: 'Cancelado a pedido del jugador: avisó tarde',
    })
  })
})

// ─── Tarea #5: no-show genera deuda (modelo ATC, sin ban temporal) ───
describe('handleNoShow — Tarea #5: genera deuda', () => {
  async function insertPastConfirmed(opts: {
    tenantId: string
    courtId: string
    playerId: string | null
    depositStatus?: string
    depositAmount?: number
  }): Promise<string> {
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      INSERT INTO bookings (
        tenant_id, court_id, player_id, date, time_start, time_end,
        starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, status
      ) VALUES (
        ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
        CURRENT_DATE - INTERVAL '1 day', '20:00'::time, '21:00'::time,
        (CURRENT_DATE - INTERVAL '1 day' + '20:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (CURRENT_DATE - INTERVAL '1 day' + '21:00'::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
        ${800_000}, ${opts.depositAmount ?? 0}, ${opts.depositStatus ?? 'not_required'}, 'confirmed'
      )
      RETURNING id
    `
    return rows[0]!.id
  }

  it('sin se\u00f1a → balance += precio completo, se\u00f1a intacta, sin ban', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertPastConfirmed({ tenantId: tenant.id, courtId, playerId: player.id })

    await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))

    expect(await getBookingStatus(bookingId)).toBe('no_show')
    expect(await getBookingDepositStatus(bookingId)).toBe('not_required')
    expect(await getPlayerBalance(tenant.id, player.id)).toBe(800_000)
    // El viejo auto-ban por no-show ya no existe.
    expect(await countAllBans(tenant.id, player.id)).toBe(0)

    const audits = await getAuditLogs(bookingId)
    expect(audits.some((a) => a.action === 'booking.marked_no_show')).toBe(true)
  })

  it('con se\u00f1a paga → se\u00f1a capturada + balance += (precio − se\u00f1a)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertPastConfirmed({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      depositStatus: 'paid',
      depositAmount: 240_000,
    })

    await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))

    expect(await getBookingStatus(bookingId)).toBe('no_show')
    expect(await getBookingDepositStatus(bookingId)).toBe('captured')
    expect(await getPlayerBalance(tenant.id, player.id)).toBe(560_000)
    expect(await countAllBans(tenant.id, player.id)).toBe(0)
  })

  it('sin jugador vinculado → no genera deuda', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertPastConfirmed({ tenantId: tenant.id, courtId, playerId: null })

    const booking = await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))

    expect(booking.status).toBe('no_show')
    expect(await getBookingStatus(bookingId)).toBe('no_show')
  })

  it('idempotente: un segundo no-show lanza y no duplica la deuda', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    const courtId = await insertCourt(tenant.id)

    const bookingId = await insertPastConfirmed({ tenantId: tenant.id, courtId, playerId: player.id })

    await withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx))
    expect(await getPlayerBalance(tenant.id, player.id)).toBe(800_000)

    await expect(
      withTenantContext(tenant.id, (tx) => handleNoShow(bookingId, staff.id, tx)),
    ).rejects.toBeInstanceOf(BookingNotInConfirmedError)

    // La deuda no se duplic\u00f3.
    expect(await getPlayerBalance(tenant.id, player.id)).toBe(800_000)
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
        await cancelByAdmin(bookingId, staff.id, 'test', 'jugador', null, tx)
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
        cancelByAdmin(bookingId, staff.id, 'x', 'complejo', mockGateway, tx),
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

// ─── GAP (auditoría): contenido del metadata del audit log de cancelación ──
// Los tests verificaban action/actor_type/actor_id del audit log, pero NUNCA el
// jsonb `metadata` ({ reason, inPolicy, depositStatus }). Ese rastro es la
// evidencia de compliance (Ley 25.326): un bug que registre inPolicy o
// depositStatus equivocados —o pierda el reason— dejaría un audit trail
// mentiroso sin romper ningún test. Acá fijamos el contenido exacto.
describe('cancelByPlayer — audit trail metadata', () => {
  it('cancelación in-policy con seña MP: metadata = { reason, inPolicy:true, depositStatus:refunded } y canceled_at seteado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 9999) // in-policy

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '02:00', timeEnd: '03:00',
      depositStatus: 'paid', depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-meta-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id, bookingId, playerId: player.id, amount: 240_000, mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, 'reembolso ok', mockGateway, tx),
    )

    const meta = await getCancelAuditMetadata(bookingId, 'booking.canceled')
    expect(meta).toMatchObject({ reason: 'reembolso ok', inPolicy: true, depositStatus: 'refunded' })
    expect(await getBookingCanceledAt(bookingId)).not.toBeNull()

    // Regresión BUG #2 (jsonb single-encode): el metadata debe quedar como
    // OBJETO at-rest (jsonb_typeof='object'), consultable por campo en SQL —
    // no un string escalar doble-codificado.
    const sqlc = getSql()
    const typeRows = await sqlc<{ t: string }[]>`
      SELECT jsonb_typeof(metadata) AS t
      FROM audit_logs
      WHERE resource_id = ${bookingId} AND action = 'booking.canceled'
      ORDER BY created_at DESC LIMIT 1
    `
    expect(typeRows[0]!.t).toBe('object')
    // Y el acceso por campo via operador jsonb funciona (lo que el doble-encode rompía).
    const fieldRows = await sqlc<{ in_policy: boolean }[]>`
      SELECT (metadata->>'inPolicy')::boolean AS in_policy
      FROM audit_logs
      WHERE resource_id = ${bookingId} AND action = 'booking.canceled'
      ORDER BY created_at DESC LIMIT 1
    `
    expect(fieldRows[0]!.in_policy).toBe(true)
  })

  it('cancelación out-of-policy sin reason: metadata = { reason:null, inPolicy:false, depositStatus:captured }', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    await setTenantPolicy(tenant.id, 20000) // out-of-policy

    const bookingId = await insertConfirmedBooking({
      tenantId: tenant.id, courtId, playerId: player.id,
      date: FUTURE_DATE, timeStart: '01:00', timeEnd: '02:00',
      depositStatus: 'paid', depositAmount: 240_000,
    })
    const mpPaymentId = `mp-pay-meta-oop-${bookingId.slice(0, 8)}`
    const paymentId = await insertApprovedPayment({
      tenantId: tenant.id, bookingId, playerId: player.id, amount: 240_000, mpPaymentId,
    })
    await linkPaymentToBooking(bookingId, paymentId)

    await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, undefined, mockGateway, tx),
    )

    const meta = await getCancelAuditMetadata(bookingId, 'booking.canceled')
    expect(meta).toMatchObject({ reason: null, inPolicy: false, depositStatus: 'captured' })
  })
})
