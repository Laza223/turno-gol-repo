import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { TenantMpNotConnectedError } from '@/modules/payments/payment.errors'
import {
  cleanupAll,
  createTestPlayer,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

// Keep post-commit email dispatch off the real pg-boss.
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

// Shared mock gateway instance — replaces MercadoPagoGateway in handler.
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

// Static import — vi.mock is hoisted above all imports, so the mock applies
// before the handler module loads `MercadoPagoGateway`.
import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'

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

const FUTURE_DATE = '2027-06-01'

async function insertCourt(tenantId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha Webhook'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function setTenantMpToken(tenantId: string): Promise<void> {
  const sql = getSql()
  // Real value irrelevant — gateway is mocked.
  await sql`
    UPDATE tenants
    SET mp_access_token = ${'dummy-encrypted-token'}
    WHERE id = ${tenantId}
  `
}

async function insertPendingBooking(opts: {
  tenantId: string
  courtId: string
  playerId: string
  date: string
  timeStart: string
  timeEnd: string
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
      ${800000}, ${240000}, 'pending', NULL, 'pending_payment'
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

async function countPaymentRows(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM payments WHERE booking_id = ${bookingId}
  `
  return Number(rows[0]!.c)
}

async function countProcessedWebhooks(mpEventId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
  `
  return Number(rows[0]!.c)
}

async function seedTrialingSubscription(tenantId: string): Promise<void> {
  const sql = getSql()
  const planRows = await sql<{ id: string }[]>`SELECT id FROM plans LIMIT 1`
  const planId = planRows[0]!.id
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end, mp_subscription_id
    ) VALUES (
      ${tenantId}, ${planId}, 'monthly'::billing_cycle, 'trialing'::subscription_status,
      ${'2027-04-01T00:00:00Z'}::timestamptz, ${'2027-05-01T00:00:00Z'}::timestamptz,
      ${`mp-preapp-${tenantId.slice(0, 8)}`}
    )
  `
}

async function getSubscriptionStatus(tenantId: string): Promise<string | undefined> {
  const sql = getSql()
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]?.status
}

async function getAuditLogs(bookingId: string) {
  const sql = getSql()
  return sql<
    Array<{
      action: string
      actor_type: string
      resource_id: string
      metadata: Record<string, unknown> | null
    }>
  >`
    SELECT action, actor_type, resource_id, metadata
    FROM audit_logs
    WHERE resource_id = ${bookingId}
    ORDER BY created_at
  `
}

async function getBookingDepositStatus(bookingId: string): Promise<string> {
  const sql = getSql()
  const rows = await sql<{ deposit_status: string }[]>`
    SELECT deposit_status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.deposit_status
}

async function getPaymentRow(
  bookingId: string,
  mpPaymentId: string,
): Promise<{ status: string; amount: number; type: string; method: string } | undefined> {
  const sql = getSql()
  const rows = await sql<
    Array<{ status: string; amount: number; type: string; method: string }>
  >`
    SELECT status, amount::int AS amount, type, method
    FROM payments
    WHERE booking_id = ${bookingId} AND mp_payment_id = ${mpPaymentId}
  `
  return rows[0]
}

function metaOf(entry: { metadata: Record<string, unknown> | null }): Record<string, unknown> {
  return typeof entry.metadata === 'string'
    ? (JSON.parse(entry.metadata as unknown as string) as Record<string, unknown>)
    : (entry.metadata as Record<string, unknown>)
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

describe('handleMpWebhookJob — idempotency across 3 deliveries', () => {
  it('same mpEventId 3x → single confirmation + single processed_webhooks row', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
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

    const mpPaymentId = `mp-pay-3x-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-3x-${bookingId.slice(0, 8)}`

    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }
    const callsBefore = mockGateway.statusCalls.length

    const job = {
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    }

    await handleMpWebhookJob(job)
    await handleMpWebhookJob(job)
    await handleMpWebhookJob(job)

    expect(await getBookingStatus(bookingId)).toBe('confirmed')
    expect(await countProcessedWebhooks(mpEventId)).toBe(1)
    // First call upserts payment row; subsequent calls short-circuit on
    // alreadyProcessed before any DB writes.
    expect(await countPaymentRows(bookingId)).toBe(1)
    // Gateway.getPaymentStatus consulted only on first call.
    expect(mockGateway.statusCalls.length - callsBefore).toBe(1)
    // The single row is the APPROVED deposit — not a stale pending/duplicated
    // row. Counting rows alone wouldn't catch a status corrupted across deliveries.
    const payment = await getPaymentRow(bookingId, mpPaymentId)
    expect(payment?.status).toBe('approved')
    // deposit_status flips to 'paid' on confirmation (doc7 Flujo 2 PASO 5) and
    // stays stable under repeated deliveries.
    expect(await getBookingDepositStatus(bookingId)).toBe('paid')
  })
})

describe('handleMpWebhookJob — late payment attempt', () => {
  it('booking already expired + approved webhook → audit_logs entry, status unchanged', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
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

    // Force terminal state before webhook arrives.
    await sql`UPDATE bookings SET status = 'expired' WHERE id = ${bookingId}`

    const mpPaymentId = `mp-pay-late-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-late-${bookingId.slice(0, 8)}`

    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'visa',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    expect(await getBookingStatus(bookingId)).toBe('expired')

    const audits = await getAuditLogs(bookingId)
    const lateEntries = audits.filter(
      (a) => a.action === 'booking.late_payment_attempt',
    )
    expect(lateEntries).toHaveLength(1)
    expect(lateEntries[0]!.actor_type).toBe('system')
    const meta = metaOf(lateEntries[0]!)
    expect(meta).toMatchObject({
      mpPaymentId,
      currentStatus: 'expired',
    })

    // Payment row still recorded as approved for audit trail.
    const paymentRows = await sql<
      Array<{ status: string; mp_payment_id: string }>
    >`
      SELECT status, mp_payment_id
      FROM payments
      WHERE booking_id = ${bookingId} AND mp_payment_id = ${mpPaymentId}
    `
    expect(paymentRows).toHaveLength(1)
    expect(paymentRows[0]!.status).toBe('approved')
  })

  it('booking already expired + approved webhook → enqueues a prominent admin notification', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
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
    await sql`UPDATE bookings SET status = 'expired' WHERE id = ${bookingId}`

    const mpPaymentId = `mp-pay-notif-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-notif-${bookingId.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'visa',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    const notifs = await sql<
      Array<{ template_name: string; recipient_type: string; recipient_id: string }>
    >`
      SELECT template_name, recipient_type, recipient_id
      FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'admin_late_payment'
    `
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.recipient_type).toBe('tenant_owner')
    expect(notifs[0]!.recipient_id).toBe(staff.id)
  })
})

describe('handleMpWebhookJob — approved deposit (happy path)', () => {
  it('confirma la reserva, marca deposit_status=paid y registra el pago aprobado', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '13:00',
      timeEnd: '14:00',
    })

    const mpPaymentId = `mp-pay-ok-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-ok-${bookingId.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    expect(await getBookingStatus(bookingId)).toBe('confirmed')
    expect(await getBookingDepositStatus(bookingId)).toBe('paid')

    const payment = await getPaymentRow(bookingId, mpPaymentId)
    expect(payment).toMatchObject({
      status: 'approved',
      amount: 240_000,
      type: 'deposit',
      method: 'mercadopago',
    })

    // Happy path: no amount-discrepancy noise in the audit trail.
    const audits = await getAuditLogs(bookingId)
    expect(audits.some((a) => a.action === 'payment.amount_discrepancy')).toBe(false)
  })

  // doc7 Flujo 2: al aprobarse la seña, el jugador tiene que enterarse por
  // email de que su reserva quedó confirmada — antes de este fix, handleApproved
  // solo encolaba admin_late_payment (won=false) y nunca avisaba al jugador.
  it('encola booking_confirmed al jugador (doc7 flujo 2)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
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

    const mpPaymentId = `mp-pay-conf-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-conf-${bookingId.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    const notifs = await sql<
      Array<{
        template_name: string
        recipient_type: string
        recipient_id: string
        content: Record<string, unknown> | string
      }>
    >`
      SELECT template_name, recipient_type, recipient_id, content
      FROM notifications
      WHERE tenant_id = ${tenant.id} AND template_name = 'booking_confirmed'
    `
    expect(notifs).toHaveLength(1)
    expect(notifs[0]!.recipient_type).toBe('player')
    expect(notifs[0]!.recipient_id).toBe(player.id)
    const content =
      typeof notifs[0]!.content === 'string'
        ? (JSON.parse(notifs[0]!.content as string) as Record<string, unknown>)
        : notifs[0]!.content
    expect(content).toMatchObject({
      courtName: 'Cancha Webhook',
      timeStart: '17:00',
      timeEnd: '18:00',
    })
  })
})

describe('handleMpWebhookJob — cross-tenant guard (IDOR)', () => {
  it('rechaza un webhook cuyo tenant reclamado no coincide con el dueño del booking y no deja rastro', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    await setTenantMpToken(tenantA.id)
    const tenantB = await createTestTenant(sql)
    await setTenantMpToken(tenantB.id)
    const player = await createTestPlayer(sql)
    const courtA = await insertCourt(tenantA.id)
    const bookingA = await insertPendingBooking({
      tenantId: tenantA.id,
      courtId: courtA,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '14:00',
      timeEnd: '15:00',
    })

    const mpPaymentId = `mp-pay-idor-${bookingA.slice(0, 8)}`
    const mpEventId = `mp-evt-idor-${bookingA.slice(0, 8)}`
    // Gateway resolves the payment to a booking owned by tenant A...
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingA,
      paymentMethodId: 'visa',
    }

    // ...but the job claims tenant B. Holder of MP_WEBHOOK_SECRET must NOT be
    // able to confirm/touch another tenant's booking.
    await expect(
      handleMpWebhookJob({
        tenantId: tenantB.id,
        mpEventId,
        eventType: 'payment',
        mpPaymentId,
        rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
      }),
    ).rejects.toThrow(/tenant mismatch/)

    // The throw rolls back the whole tx: idempotency lock undone (MP can retry
    // legitimately), no payment row, and booking A untouched.
    expect(await countProcessedWebhooks(mpEventId)).toBe(0)
    expect(await countPaymentRows(bookingA)).toBe(0)
    expect(await getBookingStatus(bookingA)).toBe('pending_payment')
    expect(await getBookingDepositStatus(bookingA)).toBe('pending')
  })
})

describe('handleMpWebhookJob — non-approved payment statuses', () => {
  it('pago in_process deja la reserva en pending_payment y registra el pago in_process', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
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

    const mpPaymentId = `mp-pay-inproc-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-inproc-${bookingId.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'in_process',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'pagofacil',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    // Booking must NOT confirm: CBU/efectivo can take 24-48h. The expiry job
    // keys off this in_process payment row to choose its cutoff.
    expect(await getBookingStatus(bookingId)).toBe('pending_payment')
    expect(await getBookingDepositStatus(bookingId)).toBe('pending')
    const payment = await getPaymentRow(bookingId, mpPaymentId)
    expect(payment?.status).toBe('in_process')
  })

  it('pago rejected deja la reserva en pending_payment y registra el pago rejected', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
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

    const mpPaymentId = `mp-pay-rej-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-rej-${bookingId.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'rejected',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'visa',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    expect(await getBookingStatus(bookingId)).toBe('pending_payment')
    expect(await getBookingDepositStatus(bookingId)).toBe('pending')
    const payment = await getPaymentRow(bookingId, mpPaymentId)
    expect(payment?.status).toBe('rejected')
  })
})

describe('handleMpWebhookJob — deposit amount discrepancy (Fix #52)', () => {
  it('monto recibido menor al esperado confirma igual pero registra discrepancia en audit_logs', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(tenant.id)
    // insertPendingBooking sets deposit_amount = 240_000.
    const bookingId = await insertPendingBooking({
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      date: FUTURE_DATE,
      timeStart: '17:00',
      timeEnd: '18:00',
    })

    const mpPaymentId = `mp-pay-disc-${bookingId.slice(0, 8)}`
    const mpEventId = `mp-evt-disc-${bookingId.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 200_000, // < 240_000 expected
      externalReference: bookingId,
      paymentMethodId: 'account_money',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'payment',
      mpPaymentId,
      rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
    })

    // MP approved → booking confirms regardless of the short amount.
    expect(await getBookingStatus(bookingId)).toBe('confirmed')

    const audits = await getAuditLogs(bookingId)
    const discrepancies = audits.filter((a) => a.action === 'payment.amount_discrepancy')
    expect(discrepancies).toHaveLength(1)
    expect(metaOf(discrepancies[0]!)).toMatchObject({
      expectedCents: 240_000,
      receivedCents: 200_000,
      mpPaymentId,
    })
    // The recorded payment reflects what was actually received, not the expected.
    const payment = await getPaymentRow(bookingId, mpPaymentId)
    expect(payment?.amount).toBe(200_000)
  })
})

describe('handleMpWebhookJob — tenant not connected to MP', () => {
  it('lanza TenantMpNotConnectedError cuando el tenant no tiene mp_access_token', async () => {
    const sql = getSql()
    // Tenant created WITHOUT setTenantMpToken → mp_access_token is NULL.
    const tenant = await createTestTenant(sql)
    const mpEventId = `mp-evt-noconn-${tenant.id.slice(0, 8)}`
    const mpPaymentId = `mp-pay-noconn-${tenant.id.slice(0, 8)}`

    await expect(
      handleMpWebhookJob({
        tenantId: tenant.id,
        mpEventId,
        eventType: 'payment',
        mpPaymentId,
        rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
      }),
    ).rejects.toThrow(TenantMpNotConnectedError)

    // Failed before the idempotency lock → MP retry can still succeed later.
    expect(await countProcessedWebhooks(mpEventId)).toBe(0)
  })
})

describe('handleMpWebhookJob — unknown booking reference', () => {
  it('no crea payment ni lanza cuando external_reference no corresponde a ningún booking', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setTenantMpToken(tenant.id)

    const missingBookingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const mpPaymentId = `mp-pay-nobk-${tenant.id.slice(0, 8)}`
    const mpEventId = `mp-evt-nobk-${tenant.id.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: missingBookingId,
      paymentMethodId: 'visa',
    }

    // Must not throw: an orphan reference is a no-op, not a retryable error.
    await expect(
      handleMpWebhookJob({
        tenantId: tenant.id,
        mpEventId,
        eventType: 'payment',
        mpPaymentId,
        rawPayload: { id: mpEventId, type: 'payment', data: { id: mpPaymentId } },
      }),
    ).resolves.toBeUndefined()

    expect(await countPaymentRows(missingBookingId)).toBe(0)
    // Event is consumed (lock committed) so MP retries don't reprocess forever.
    expect(await countProcessedWebhooks(mpEventId)).toBe(1)
  })
})

describe('handleMpWebhookJob — suscripción SaaS usa el gateway master (TG-BL-03)', () => {
  it('activa trialing→active con subscription_authorized_payment aunque el tenant NO tenga MP conectado para señas', async () => {
    const sql = getSql()
    // Deliberately no setTenantMpToken(): mp_access_token stays NULL. Before
    // the fix, ANY event type threw TenantMpNotConnectedError right here —
    // a tenant can be current on its SaaS subscription without ever having
    // connected MP for booking deposits.
    const tenant = await createTestTenant(sql)
    await seedTrialingSubscription(tenant.id)

    const mpPaymentId = `mp-pay-sub-ok-${tenant.id.slice(0, 8)}`
    const mpEventId = `mp-evt-sub-ok-${tenant.id.slice(0, 8)}`
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 350_000,
      externalReference: tenant.id, // createPreapproval sets external_reference = tenantId
      paymentMethodId: 'account_money',
    }

    await handleMpWebhookJob({
      tenantId: tenant.id,
      mpEventId,
      eventType: 'subscription_authorized_payment',
      mpPaymentId,
      rawPayload: {
        id: mpEventId,
        type: 'subscription_authorized_payment',
        data: { id: mpPaymentId },
      },
    })

    expect(await getSubscriptionStatus(tenant.id)).toBe('active')
  })

  it('rechaza subscription_authorized_payment cuyo external_reference no coincide con el tenant reclamado (IDOR) sin mutar ningún estado', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    await seedTrialingSubscription(tenantA.id)
    const tenantB = await createTestTenant(sql)
    await seedTrialingSubscription(tenantB.id)

    const mpPaymentId = `mp-pay-sub-idor-${tenantB.id.slice(0, 8)}`
    const mpEventId = `mp-evt-sub-idor-${tenantB.id.slice(0, 8)}`
    // Gateway resolves the payment to tenant A's preapproval (external_reference)...
    mockGateway.statusByPaymentId[mpPaymentId] = {
      mpPaymentId,
      status: 'approved',
      amount: 350_000,
      externalReference: tenantA.id,
      paymentMethodId: 'account_money',
    }

    // ...but the job claims tenant B (e.g. attacker-controlled ?tenant= query
    // on the shared webhook URL, or a stale/misrouted event).
    await expect(
      handleMpWebhookJob({
        tenantId: tenantB.id,
        mpEventId,
        eventType: 'subscription_authorized_payment',
        mpPaymentId,
        rawPayload: {
          id: mpEventId,
          type: 'subscription_authorized_payment',
          data: { id: mpPaymentId },
        },
      }),
    ).rejects.toThrow(/tenant mismatch/)

    // Neither subscription transitioned, and the event was never locked (so
    // a legitimate retry for the correct tenant can still succeed later).
    expect(await getSubscriptionStatus(tenantA.id)).toBe('trialing')
    expect(await getSubscriptionStatus(tenantB.id)).toBe('trialing')
    expect(await countProcessedWebhooks(mpEventId)).toBe(0)
  })
})
