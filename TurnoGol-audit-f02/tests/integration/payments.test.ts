import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import {
  closeSql,
  getDb,
  getSql,
  withTenantContext,
} from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  createDepositPayment,
  createRefund,
  processWebhook,
} from '@/modules/payments/payment.service'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

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

const FUTURE_DATE = '2027-05-10'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Pago'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertPendingBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  date: string
  timeStart: string
  timeEnd: string
  depositAmount?: number
}): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      ${800000}, ${opts.depositAmount ?? 240000},
      'pending', NULL, 'pending_payment'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function getBookingStatus(bookingId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.status
}

async function getPaymentRows(bookingId: string) {
  const sql = getSql()
  return sql<
    Array<{
      id: string
      type: string
      status: string
      amount: number
      mp_payment_id: string | null
      mp_preference_id: string | null
    }>
  >`
    SELECT id, type, status, amount, mp_payment_id, mp_preference_id
    FROM payments
    WHERE booking_id = ${bookingId}
    ORDER BY created_at
  `
}

async function getProcessedWebhookCount(mpEventId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
  `
  return Number(rows[0]!.c)
}

async function getCashFlowCount(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM cash_flows WHERE booking_id = ${bookingId}
  `
  return Number(rows[0]!.c)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  await sql.unsafe(`TRUNCATE TABLE processed_webhooks RESTART IDENTITY CASCADE`)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('processWebhook — idempotency (Pilar B)', () => {
  it('duplicate mp_event_id → second call does not fire side effects', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '08:00',
      timeEnd: '09:00',
    })

    const mpPaymentId = `mp-pay-idem-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-idem-${bookingId.slice(0, 8)}`

    const gateway = new MockGateway()
    gateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    const event = {
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    }

    const first = await withTenantContext(tenant.id, (tx) =>
      processWebhook(event, tenant.id, gateway, tx),
    )
    expect(first.alreadyProcessed).toBe(false)
    if (!first.alreadyProcessed) expect(first.result).toBe('confirmed')
    expect(await getBookingStatus(bookingId)).toBe('confirmed')

    const paymentsAfterFirst = await getPaymentRows(bookingId)
    const approvedAfterFirst = paymentsAfterFirst.filter(
      (p) => p.status === 'approved',
    )
    expect(approvedAfterFirst).toHaveLength(1)

    const second = await withTenantContext(tenant.id, (tx) =>
      processWebhook(event, tenant.id, gateway, tx),
    )
    expect(second.alreadyProcessed).toBe(true)
    // Booking still confirmed — no double transition.
    expect(await getBookingStatus(bookingId)).toBe('confirmed')
    // No extra payment row was inserted.
    const paymentsAfterSecond = await getPaymentRows(bookingId)
    expect(paymentsAfterSecond.length).toBe(paymentsAfterFirst.length)
    // processed_webhooks holds exactly one row (UNIQUE constraint).
    expect(await getProcessedWebhookCount(mpEventId)).toBe(1)
    // Gateway only consulted on first call.
    expect(gateway.statusCalls).toEqual([mpPaymentId])
  })
})

describe('processWebhook — in_process → approved (Fix #1, Fase 1)', () => {
  it('first webhook in_process keeps booking pending; second approved confirms it', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '09:00',
      timeEnd: '10:00',
    })

    const mpPaymentId = `mp-pay-inproc-${bookingId.slice(0, 8)}`

    // Gateway will reflect status changes between webhooks.
    let mpStatus: 'in_process' | 'approved' = 'in_process'
    const gateway = new MockGateway({
      statusOverride: (id) =>
        id === mpPaymentId
          ? {
              mpPaymentId,
              status: mpStatus,
              amount: 240_000,
              externalReference: bookingId,
              paymentMethodId: 'transfer',
            }
          : undefined,
    })

    // Webhook 1: in_process
    const event1 = {
      mpEventId: `evt-inproc-1-${bookingId.slice(0, 8)}`,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: 'evt-inproc-1', data: { id: mpPaymentId } },
    }
    const r1 = await withTenantContext(tenant.id, (tx) =>
      processWebhook(event1, tenant.id, gateway, tx),
    )
    expect(r1.alreadyProcessed).toBe(false)
    if (!r1.alreadyProcessed) expect(r1.result).toBe('in_process')
    expect(await getBookingStatus(bookingId)).toBe('pending_payment')

    const rowsAfter1 = await getPaymentRows(bookingId)
    expect(rowsAfter1.some((p) => p.status === 'in_process')).toBe(true)

    // Webhook 2: approved (different mpEventId, same mpPaymentId)
    mpStatus = 'approved'
    const event2 = {
      mpEventId: `evt-inproc-2-${bookingId.slice(0, 8)}`,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: 'evt-inproc-2', data: { id: mpPaymentId } },
    }
    const r2 = await withTenantContext(tenant.id, (tx) =>
      processWebhook(event2, tenant.id, gateway, tx),
    )
    expect(r2.alreadyProcessed).toBe(false)
    if (!r2.alreadyProcessed) expect(r2.result).toBe('confirmed')
    expect(await getBookingStatus(bookingId)).toBe('confirmed')

    const rowsAfter2 = await getPaymentRows(bookingId)
    // Same mp_payment_id → ON CONFLICT DO UPDATE consolidated to a single
    // approved payment row (plus any pre-existing rows from setup).
    const sameMpRows = rowsAfter2.filter((p) => p.mp_payment_id === mpPaymentId)
    expect(sameMpRows).toHaveLength(1)
    expect(sameMpRows[0]!.status).toBe('approved')
  })
})

describe('processWebhook — race against expiry (Pilar C)', () => {
  it('won=false → no booking transition, payment row still recorded for audit', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '10:00',
      timeEnd: '11:00',
    })

    // Pre-expire the booking before the webhook arrives.
    await sql`UPDATE bookings SET status = 'expired' WHERE id = ${bookingId}`

    const mpPaymentId = `mp-pay-race-${bookingId.slice(0, 8)}`
    const gateway = new MockGateway()
    gateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'visa',
    }

    const event = {
      mpEventId: `evt-race-${bookingId.slice(0, 8)}`,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: 'evt-race', data: { id: mpPaymentId } },
    }

    const result = await withTenantContext(tenant.id, (tx) =>
      processWebhook(event, tenant.id, gateway, tx),
    )

    // Returns 'confirmed' from the service POV, but transitionFromPendingPayment
    // returned won=false — the booking stays expired (immutable per state machine).
    expect(result.alreadyProcessed).toBe(false)
    expect(await getBookingStatus(bookingId)).toBe('expired')
    // Payment row recorded as approved for audit trail.
    const rows = await getPaymentRows(bookingId)
    expect(rows.some((p) => p.mp_payment_id === mpPaymentId && p.status === 'approved')).toBe(true)
  })
})

describe('createRefund — new row, no cash_flow (Fix #9 Fase 3)', () => {
  it('refund inserts a new payment row and leaves the original untouched', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '11:00',
      timeEnd: '12:00',
    })

    // Insert an approved deposit payment directly.
    const mpPaymentId = `mp-pay-refund-${bookingId.slice(0, 8)}`
    const insertRes = await sql<{ id: string }[]>`
      INSERT INTO payments (
        tenant_id, booking_id, player_id, amount, type, method, status,
        mp_payment_id, processed_at
      ) VALUES (
        ${tenant.id}, ${bookingId}, ${player.id}, ${240000},
        'deposit', 'mercadopago', 'approved',
        ${mpPaymentId}, NOW()
      )
      RETURNING id
    `
    const originalId = insertRes[0]!.id

    const gateway = new MockGateway()

    const result = await withTenantContext(tenant.id, (tx) =>
      createRefund(originalId, undefined, gateway, tx),
    )

    expect(gateway.refundCalls).toHaveLength(1)
    expect(gateway.refundCalls[0]!.mpPaymentId).toBe(mpPaymentId)

    const rows = await getPaymentRows(bookingId)
    const original = rows.find((r) => r.id === originalId)
    expect(original).toBeDefined()
    expect(original!.status).toBe('approved')
    expect(original!.type).toBe('deposit')

    const refund = rows.find((r) => r.id === result.refundPaymentId)
    expect(refund).toBeDefined()
    expect(refund!.type).toBe('refund')
    expect(refund!.amount).toBe(240000)
    expect(refund!.status).toBe('approved')

    // Refund does NOT generate a cash_flow row (Fix #9).
    expect(await getCashFlowCount(bookingId)).toBe(0)
  })
})

describe('createDepositPayment — booking-payment consistency (Fix #13)', () => {
  it('creates payment row + updates booking.payment_method/payment_id atomically', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '12:00',
      timeEnd: '13:00',
    })

    const gateway = new MockGateway()

    const pref = await withTenantContext(tenant.id, (tx) =>
      createDepositPayment(bookingId, gateway, tx, 'https://app.test'),
    )

    expect(pref.preferenceId).toMatch(/^mp-pref-/)
    expect(pref.initPoint).toContain(bookingId)
    expect(gateway.preferenceCalls).toHaveLength(1)
    expect(gateway.preferenceCalls[0]!.notificationUrl).toContain(`tenant=${tenant.id}`)

    const bookingRow = await sql<
      Array<{
        payment_method: string | null
        payment_id: string | null
      }>
    >`
      SELECT payment_method, payment_id FROM bookings WHERE id = ${bookingId}
    `
    expect(bookingRow[0]!.payment_method).toBe('mercadopago')
    expect(bookingRow[0]!.payment_id).not.toBeNull()

    const rows = await getPaymentRows(bookingId)
    const pendingRow = rows.find((r) => r.status === 'pending' && r.mp_preference_id === pref.preferenceId)
    expect(pendingRow).toBeDefined()
    expect(pendingRow!.id).toBe(bookingRow[0]!.payment_id)
  })
})
