import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import { CircuitOpenError } from '@/modules/payments/mp-circuit-breaker'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import type { GatewayPaymentInfo } from '@/modules/payments/payment.types'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

// Keep post-commit email/push dispatch off the real pg-boss.
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

/**
 * Controllable stand-in for the real MercadoPagoGateway. We mock the
 * *implementation* (NOT resolveTenantGateway) precisely so the production
 * `withCircuitBreaker(...)` layer and its shared per-process breaker run for
 * real — that breaker IS what's under test. Must be `mock`-prefixed so Vitest
 * lets the hoisted vi.mock factory reference it.
 */
const mockCtl = {
  statusThrow: false,
  statusByPaymentId: {} as Record<string, GatewayPaymentInfo>,
  innerStatusCalls: 0,
  searchThrowRefs: new Set<string>(),
  searchResults: {} as Record<string, GatewayPaymentInfo[]>,
  innerSearchCalls: 0,
}

vi.mock('@/modules/payments/mp-gateway.implementation', () => ({
  MercadoPagoGateway: class {
    constructor(_encryptedAccessToken: string, _opts?: unknown) {}
    async getPaymentStatus(id: string): Promise<GatewayPaymentInfo> {
      mockCtl.innerStatusCalls += 1
      if (mockCtl.statusThrow) throw new Error('MP 500')
      const info = mockCtl.statusByPaymentId[id]
      if (!info) throw new Error(`no status registered for ${id}`)
      return info
    }
    async searchPaymentsByReference(ref: string): Promise<GatewayPaymentInfo[]> {
      mockCtl.innerSearchCalls += 1
      if (mockCtl.searchThrowRefs.has(ref)) throw new Error('MP 500')
      return mockCtl.searchResults[ref] ?? []
    }
  },
}))

// Static imports — vi.mock is hoisted above all imports, so the mock applies
// before these modules load `MercadoPagoGateway`.
import { handleMpWebhookJob } from '@/modules/payments/mp-webhook.handler'
import { reconcilePendingPayments } from '@/shared/jobs/workers/reconcile-pending-payments.worker'

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

const FUTURE_DATE = '2027-09-01'

async function setMpToken(sql: Sql, tenantId: string): Promise<void> {
  // Real value irrelevant — the gateway implementation is mocked.
  await sql`UPDATE tenants SET mp_access_token = ${'dummy-encrypted-token'} WHERE id = ${tenantId}`
}

async function insertCourt(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, ${'Cancha CB'}, ${10}, ${sql.json(PRICING)}, 'online')
    RETURNING id
  `
  return rows[0]!.id
}

async function insertPendingBooking(
  sql: Sql,
  opts: { tenantId: string; courtId: string; playerId: string; timeStart: string; timeEnd: string },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status
    )
    VALUES (
      ${opts.tenantId}, ${opts.courtId}, ${opts.playerId},
      ${FUTURE_DATE}::date, ${opts.timeStart}::time, ${opts.timeEnd}::time,
      (${FUTURE_DATE}::date + ${opts.timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${opts.timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800000}, ${240000}, 'pending', NULL, 'pending_payment'
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function getBookingStatus(sql: Sql, bookingId: string): Promise<string> {
  const rows = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${bookingId}`
  return rows[0]!.status
}

async function getBookingDepositStatus(sql: Sql, bookingId: string): Promise<string> {
  const rows = await sql<{ deposit_status: string }[]>`
    SELECT deposit_status FROM bookings WHERE id = ${bookingId}
  `
  return rows[0]!.deposit_status
}

async function countPaymentRows(sql: Sql, bookingId: string): Promise<number> {
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM payments WHERE booking_id = ${bookingId}
  `
  return Number(rows[0]!.c)
}

async function countProcessedWebhooks(sql: Sql, mpEventId: string): Promise<number> {
  const rows = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
  `
  return Number(rows[0]!.c)
}

/** A booking eligible for reconcile: stuck >5min in pending_payment with a pending MP preference row. */
async function setupStuckBooking(
  sql: Sql,
  timeStart: string,
  timeEnd: string,
): Promise<{ tenantId: string; bookingId: string; playerId: string }> {
  const tenant = await createTestTenant(sql)
  await setMpToken(sql, tenant.id)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  const courtId = await insertCourt(sql, tenant.id)

  const [{ id: bookingId }] = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at,
      price_snapshot, deposit_amount, deposit_status, payment_method, status, created_at
    )
    VALUES (
      ${tenant.id}, ${courtId}, ${player.id},
      ${FUTURE_DATE}::date, ${timeStart}::time, ${timeEnd}::time,
      (${FUTURE_DATE}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE_DATE}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ${800000}, ${240000}, 'pending', NULL, 'pending_payment',
      NOW() - INTERVAL '10 minutes'
    )
    RETURNING id
  `
  await sql`
    INSERT INTO payments (tenant_id, booking_id, player_id, amount, type, method, status, mp_preference_id)
    VALUES (${tenant.id}, ${bookingId}, ${player.id}, ${240000}, 'deposit', 'mercadopago', 'pending', ${'pref-' + bookingId})
  `
  return { tenantId: tenant.id, bookingId, playerId: player.id }
}

/** Drive `key` to OPEN by forcing `failures` consecutive failures through the real breaker. */
async function openBreakerFor(call: () => Promise<unknown>, failures = 3): Promise<void> {
  for (let i = 0; i < failures; i++) {
    await expect(call()).rejects.toThrow('MP 500')
  }
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  await sql.unsafe(`TRUNCATE TABLE processed_webhooks RESTART IDENTITY CASCADE`)
}, 30_000)

afterEach(() => {
  mockCtl.statusThrow = false
  mockCtl.statusByPaymentId = {}
  mockCtl.searchThrowRefs = new Set<string>()
  mockCtl.searchResults = {}
})

afterAll(async () => {
  await closeSql()
})

describe('circuit breaker transient-error contract', () => {
  it('webhook handler: CircuitOpenError propaga como retryable — tx rollback, booking intacto', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await setMpToken(sql, tenant.id)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const bookingId = await insertPendingBooking(sql, {
      tenantId: tenant.id,
      courtId,
      playerId: player.id,
      timeStart: '08:00',
      timeEnd: '09:00',
    })

    const cobPaymentId = `mp-pay-cob-${bookingId.slice(0, 8)}`
    const cobEventId = `mp-evt-cob-${bookingId.slice(0, 8)}`
    // A HEALTHY approved status: if the breaker weren't open, this webhook WOULD confirm.
    mockCtl.statusByPaymentId[cobPaymentId] = {
      mpPaymentId: cobPaymentId,
      status: 'approved',
      amount: 240_000,
      externalReference: bookingId,
      paymentMethodId: 'visa',
    }

    // Prime: 3 failing getPaymentStatus calls open the per-tenant breaker (default threshold 3).
    mockCtl.statusThrow = true
    await openBreakerFor(() =>
      handleMpWebhookJob({
        tenantId: tenant.id,
        mpEventId: `mp-evt-prime-${bookingId.slice(0, 8)}-${Math.random()}`,
        eventType: 'payment',
        mpPaymentId: `mp-pay-prime-${bookingId.slice(0, 8)}`,
        rawPayload: { id: 'prime', type: 'payment', data: { id: 'prime' } },
      }),
    )

    // Breaker now OPEN. Make the gateway healthy again to PROVE the breaker — not a
    // gateway error — is what short-circuits the next call.
    mockCtl.statusThrow = false
    const innerBefore = mockCtl.innerStatusCalls

    await expect(
      handleMpWebhookJob({
        tenantId: tenant.id,
        mpEventId: cobEventId,
        eventType: 'payment',
        mpPaymentId: cobPaymentId,
        rawPayload: { id: cobEventId, type: 'payment', data: { id: cobPaymentId } },
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError)

    // 1) Short-circuit: the open breaker never touched the (now-healthy) gateway.
    expect(mockCtl.innerStatusCalls - innerBefore).toBe(0)
    // 2) Transient: the throw rolled the tenant tx back → no idempotency row →
    //    pg-boss retries this exact event instead of dropping the payment.
    expect(await countProcessedWebhooks(sql, cobEventId)).toBe(0)
    // 3) The booking was NOT turned into a terminal "payment failed" outcome.
    expect(await getBookingStatus(sql, bookingId)).toBe('pending_payment')
    expect(await getBookingDepositStatus(sql, bookingId)).toBe('pending')
    expect(await countPaymentRows(sql, bookingId)).toBe(0)
  }, 30_000)

  it('reconcile worker: CircuitOpenError de un tenant no aborta la reconciliación del resto', async () => {
    const sql = getSql()
    // Tenant A: breaker will be OPEN → its row throws CircuitOpenError inside the loop.
    const a = await setupStuckBooking(sql, '10:00', '11:00')
    // Tenant B: healthy → must still get confirmed despite A failing first.
    const b = await setupStuckBooking(sql, '12:00', '13:00')

    const bPaymentId = `recon-${b.bookingId.slice(0, 8)}`
    mockCtl.searchResults[b.bookingId] = [
      {
        mpPaymentId: bPaymentId,
        status: 'approved',
        amount: 240_000,
        externalReference: b.bookingId,
        paymentMethodId: 'visa',
      },
    ]

    // Prime tenant A's breaker via the real wiring (same singleton, key tenant:<A>).
    mockCtl.searchThrowRefs.add('prime-A')
    const gwA = resolveTenantGateway(a.tenantId, 'dummy-encrypted-token')
    await openBreakerFor(() => gwA.searchPaymentsByReference('prime-A'))
    // Precondition: A is now open — a real call short-circuits with CircuitOpenError.
    await expect(gwA.searchPaymentsByReference(a.bookingId)).rejects.toBeInstanceOf(
      CircuitOpenError,
    )

    const innerBefore = mockCtl.innerSearchCalls
    const reconciled = await reconcilePendingPayments()

    // Only B reconciled — A's CircuitOpenError was caught per-row and the loop continued.
    expect(reconciled).toBe(1)
    expect(await getBookingStatus(sql, b.bookingId)).toBe('confirmed')
    // A untouched: not confirmed, not crashed.
    expect(await getBookingStatus(sql, a.bookingId)).toBe('pending_payment')
    // A short-circuited (breaker open → inner not hit); only B reached the gateway.
    expect(mockCtl.innerSearchCalls - innerBefore).toBe(1)
  }, 30_000)
})
