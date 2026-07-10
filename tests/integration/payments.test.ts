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
  prepareRefund,
  settleRefund,
  processWebhook,
} from '@/modules/payments/payment.service'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import {
  BookingNotPendingPaymentError,
  RefundInvalidStateError,
} from '@/modules/payments/payment.errors'
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
      price: 800000,
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
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${opts.date}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${opts.date}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${opts.date}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
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

async function getAuditActions(resourceId: string) {
  const sql = getSql()
  return sql<
    Array<{
      action: string
      actor_type: string
      metadata: Record<string, unknown> | string | null
    }>
  >`
    SELECT action, actor_type, metadata
    FROM audit_logs
    WHERE resource_id = ${resourceId}
    ORDER BY created_at
  `
}

function parseMeta(
  m: Record<string, unknown> | string | null,
): Record<string, unknown> {
  if (m == null) return {}
  return typeof m === 'string'
    ? (JSON.parse(m) as Record<string, unknown>)
    : m
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

    // Service maps gateway 'approved' → result 'confirmed', but the booking
    // transition lost the race (won=false): it stays 'expired' (terminal,
    // immutable per state machine).
    expect(result.alreadyProcessed).toBe(false)
    if (!result.alreadyProcessed) expect(result.result).toBe('confirmed')
    expect(await getBookingStatus(bookingId)).toBe('expired')

    // Payment row recorded as approved for audit trail — exactly one, no dup.
    const rows = await getPaymentRows(bookingId)
    const approvedForPayment = rows.filter(
      (p) => p.mp_payment_id === mpPaymentId && p.status === 'approved',
    )
    expect(approvedForPayment).toHaveLength(1)

    // CRITICAL won=false obligation (Hallazgo 3): a late payment on a terminal
    // booking MUST leave an audit trail for the admin's manual refund decision.
    // A regression that silently drops this row would strand the player's money
    // with no operational trace — the original test never checked for it.
    const audits = await getAuditActions(bookingId)
    const late = audits.filter(
      (a) => a.action === 'booking.late_payment_attempt',
    )
    expect(late).toHaveLength(1)
    expect(late[0]!.actor_type).toBe('system')
    expect(parseMeta(late[0]!.metadata)).toMatchObject({
      mpPaymentId,
      currentStatus: 'expired',
    })
  })
})

describe('prepareRefund + settleRefund — new row, no cash_flow (Fix #9 Fase 3; saga split caza-bugs #3)', () => {
  it('prepareRefund inserts a pending row inside the tx; settleRefund calls MP after commit and approves it', async () => {
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

    const prepared = await withTenantContext(tenant.id, (tx) =>
      prepareRefund(originalId, undefined, tx),
    )

    // Phase 1 never touches MP: no gateway call yet, refund row inserted 'pending'.
    expect(gateway.refundCalls).toHaveLength(0)
    const afterPrepare = await getPaymentRows(bookingId)
    const pendingRefund = afterPrepare.find((r) => r.id === prepared.refundPaymentId)
    expect(pendingRefund).toMatchObject({ type: 'refund', amount: 240000, status: 'pending', mp_payment_id: null })

    const settled = await settleRefund(prepared, gateway, tenant.id)
    expect(settled.status).toBe('approved')

    expect(gateway.refundCalls).toHaveLength(1)
    expect(gateway.refundCalls[0]!.mpPaymentId).toBe(mpPaymentId)

    const rows = await getPaymentRows(bookingId)
    const original = rows.find((r) => r.id === originalId)
    expect(original).toBeDefined()
    expect(original!.status).toBe('approved')
    expect(original!.type).toBe('deposit')

    const refund = rows.find((r) => r.id === prepared.refundPaymentId)
    expect(refund).toBeDefined()
    expect(refund!.type).toBe('refund')
    expect(refund!.amount).toBe(240000)
    expect(refund!.status).toBe('approved')
    expect(refund!.mp_payment_id).not.toBeNull()

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

    const pref = await createDepositPayment(bookingId, gateway, tenant.id, 'https://app.test')

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

// ─── GAP (caza-bugs #1): re-link post-webhook, no cancelación huérfana ─────
// Ningún test previo encadenaba createDepositPayment → webhook approval →
// cancelación: cancellations.test.ts inserta el payment 'approved' YA linkeado
// a mano (linkPaymentToBooking), así que nunca ejercitó el camino real por el
// que bookings.payment_id llega a apuntar a una fila aprobada. Sin este test,
// una regresión que vuelva a "insertar fila nueva en vez de re-linkear" pasa
// la suite entera en verde mientras prepareRefund lanza RefundInvalidStateError
// en producción para TODA cancelación con seña MP.
describe('createDepositPayment → webhook approval → cancelByPlayer — re-link (caza-bugs #1)', () => {
  it('bookings.payment_id sigue apuntando a la misma fila tras el webhook, y la cancelación refunda de verdad', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '18:00',
      timeEnd: '19:00',
      depositAmount: 240_000,
    })

    const gateway = new MockGateway()
    await createDepositPayment(bookingId, gateway, tenant.id, 'https://app.test')

    const introRow = await sql<{ payment_id: string | null }[]>`
      SELECT payment_id FROM bookings WHERE id = ${bookingId}
    `
    const intentPaymentId = introRow[0]!.payment_id
    expect(intentPaymentId).not.toBeNull()

    const mpPaymentId = `mp-pay-relink-${bookingId.slice(0, 8)}`
    gateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    await withTenantContext(tenant.id, (tx) =>
      processWebhook(
        {
          mpEventId: `evt-relink-${bookingId.slice(0, 8)}`,
          eventType: 'payment',
          mpPaymentId,
          rawPayload: { id: 'evt-relink', data: { id: mpPaymentId } },
        },
        tenant.id,
        gateway,
        tx,
      ),
    )

    expect(await getBookingStatus(bookingId)).toBe('confirmed')

    // Re-linkeo: el webhook actualizó la MISMA fila (misma id que
    // createDepositPayment ya había puesto en bookings.payment_id) en vez de
    // insertar una fila nueva y huérfana.
    const afterWebhook = await sql<
      { payment_id: string | null; deposit_status: string }[]
    >`SELECT payment_id, deposit_status FROM bookings WHERE id = ${bookingId}`
    expect(afterWebhook[0]!.payment_id).toBe(intentPaymentId)
    expect(afterWebhook[0]!.deposit_status).toBe('paid')

    const rows = await getPaymentRows(bookingId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: intentPaymentId,
      status: 'approved',
      mp_payment_id: mpPaymentId,
      amount: 240_000,
    })

    // La cancelación debe refundar de verdad, no lanzar RefundInvalidStateError
    // por encontrar mp_payment_id=NULL en la fila que payment_id todavía apuntaba.
    // prepareRefund (dentro de la tx) no toca MP todavía — recién settleRefund,
    // después de commitear, hace la llamada real (caza-bugs #3).
    const canceled = await withTenantContext(tenant.id, (tx) =>
      cancelByPlayer(bookingId, player.id, 'me arrepentí', gateway, tx),
    )
    expect(canceled.booking.status).toBe('canceled_refunded')
    expect(canceled.pendingRefund).toBeDefined()
    expect(gateway.refundCalls).toHaveLength(0)

    await settleRefund(canceled.pendingRefund!, gateway, tenant.id)
    expect(gateway.refundCalls).toContainEqual({ mpPaymentId, amount: 240_000 })
  })
})

// ─── GAP: discrepancia de monto (Fix #52) ──────────────────────────────────
// La seña recibida puede ser menor a la esperada (MP aprueba un monto parcial).
// Regla: la reserva se confirma igual, pero el faltante queda auditado para el
// admin. Sin test, una regresión que omita el audit pasa silenciosa en TODA la
// suite (no había cobertura unit ni integration de este branch).
describe('handleApproved — discrepancia de monto (Fix #52)', () => {
  it('confirma la reserva pero audita cuando la seña recibida es menor a la esperada', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '13:00',
      timeEnd: '14:00',
      depositAmount: 240_000,
    })

    const mpPaymentId = `mp-pay-disc-${bookingId.slice(0, 8)}`
    const gateway = new MockGateway()
    // MP aprobó, pero sólo entraron 200_000 vs los 240_000 esperados.
    gateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 200_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    const result = await withTenantContext(tenant.id, (tx) =>
      processWebhook(
        {
          mpEventId: `evt-disc-${bookingId.slice(0, 8)}`,
          eventType: 'payment',
          mpPaymentId,
          rawPayload: { id: 'evt-disc', data: { id: mpPaymentId } },
        },
        tenant.id,
        gateway,
        tx,
      ),
    )

    expect(result.alreadyProcessed).toBe(false)
    if (!result.alreadyProcessed) expect(result.result).toBe('confirmed')
    // MP aprobó → la reserva se confirma igual.
    expect(await getBookingStatus(bookingId)).toBe('confirmed')

    // El faltante queda registrado para seguimiento manual del admin.
    const disc = (await getAuditActions(bookingId)).filter(
      (a) => a.action === 'payment.amount_discrepancy',
    )
    expect(disc).toHaveLength(1)
    expect(parseMeta(disc[0]!.metadata)).toMatchObject({
      expectedCents: 240_000,
      receivedCents: 200_000,
      mpPaymentId,
    })

    // El payment row guarda el monto realmente recibido, no el esperado.
    const approved = (await getPaymentRows(bookingId)).find(
      (r) => r.mp_payment_id === mpPaymentId,
    )
    expect(approved!.amount).toBe(200_000)
  })

  it('NO audita discrepancia cuando el monto coincide exactamente', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '14:00',
      timeEnd: '15:00',
      depositAmount: 240_000,
    })

    const mpPaymentId = `mp-pay-exact-${bookingId.slice(0, 8)}`
    const gateway = new MockGateway()
    gateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    await withTenantContext(tenant.id, (tx) =>
      processWebhook(
        {
          mpEventId: `evt-exact-${bookingId.slice(0, 8)}`,
          eventType: 'payment',
          mpPaymentId,
          rawPayload: { id: 'evt-exact', data: { id: mpPaymentId } },
        },
        tenant.id,
        gateway,
        tx,
      ),
    )

    expect(await getBookingStatus(bookingId)).toBe('confirmed')
    const disc = (await getAuditActions(bookingId)).filter(
      (a) => a.action === 'payment.amount_discrepancy',
    )
    expect(disc).toHaveLength(0)
  })
})

// ─── GAP: webhook con pago rechazado ───────────────────────────────────────
// dispatchPaymentInfo ramifica por status; el branch 'rejected' no tenía
// ninguna cobertura. Un rechazo NO debe confirmar ni matar la reserva.
describe('processWebhook — pago rechazado', () => {
  it('estado rejected: registra payment rechazado y la reserva sigue pending_payment', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '15:00',
      timeEnd: '16:00',
    })

    const mpPaymentId = `mp-pay-rej-${bookingId.slice(0, 8)}`
    const gateway = new MockGateway()
    gateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'rejected',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'visa',
    }

    const result = await withTenantContext(tenant.id, (tx) =>
      processWebhook(
        {
          mpEventId: `evt-rej-${bookingId.slice(0, 8)}`,
          eventType: 'payment',
          mpPaymentId,
          rawPayload: { id: 'evt-rej', data: { id: mpPaymentId } },
        },
        tenant.id,
        gateway,
        tx,
      ),
    )

    expect(result.alreadyProcessed).toBe(false)
    if (!result.alreadyProcessed) expect(result.result).toBe('rejected')
    // Un rechazo no confirma ni expira la reserva: sigue esperando pago.
    expect(await getBookingStatus(bookingId)).toBe('pending_payment')

    const rej = (await getPaymentRows(bookingId)).filter(
      (r) => r.mp_payment_id === mpPaymentId,
    )
    expect(rej).toHaveLength(1)
    expect(rej[0]!.status).toBe('rejected')
  })
})

// ─── GAP: guards de createDepositPayment / createRefund ────────────────────
// Error paths que el archivo nunca ejercitaba. Ambos deben fallar ANTES de
// tocar MP (no se crea preferencia ni refund en el gateway).
describe('createDepositPayment / createRefund — guards', () => {
  it('createDepositPayment rechaza una reserva que no está en pending_payment, sin llamar a MP', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '16:00',
      timeEnd: '17:00',
    })
    // Reserva ya confirmada: no se le puede generar otra seña.
    await sql`UPDATE bookings SET status = 'confirmed' WHERE id = ${bookingId}`

    const gateway = new MockGateway()

    await expect(
      createDepositPayment(bookingId, gateway, tenant.id, 'https://app.test'),
    ).rejects.toBeInstanceOf(BookingNotPendingPaymentError)

    // Sin efectos: ni preferencia en MP ni payment row.
    expect(gateway.preferenceCalls).toHaveLength(0)
    expect(await getPaymentRows(bookingId)).toHaveLength(0)
  })

  it('prepareRefund rechaza el refund de un pago no aprobado sin llamar a MP', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '17:00',
      timeEnd: '18:00',
    })

    // Pago de seña en estado 'pending' (no aprobado) → no es refundeable.
    const mpPaymentId = `mp-pay-guard-${bookingId.slice(0, 8)}`
    const ins = await sql<{ id: string }[]>`
      INSERT INTO payments (
        tenant_id, booking_id, player_id, amount, type, method, status, mp_payment_id
      ) VALUES (
        ${tenant.id}, ${bookingId}, ${player.id}, ${240000},
        'deposit', 'mercadopago', 'pending', ${mpPaymentId}
      ) RETURNING id
    `
    const pendingPaymentId = ins[0]!.id

    const gateway = new MockGateway()

    await expect(
      withTenantContext(tenant.id, (tx) =>
        prepareRefund(pendingPaymentId, undefined, tx),
      ),
    ).rejects.toBeInstanceOf(RefundInvalidStateError)

    // No se tocó MP ni se creó payment row de refund.
    expect(gateway.refundCalls).toHaveLength(0)
    const refunds = (await getPaymentRows(bookingId)).filter(
      (r) => r.type === 'refund',
    )
    expect(refunds).toHaveLength(0)
  })
})
