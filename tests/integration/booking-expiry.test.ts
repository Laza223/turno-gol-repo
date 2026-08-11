import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep dispatchEmail / scheduler default-path off the real pg-boss.
vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn(async () => {}) })),
  stopBoss: vi.fn(async () => {}),
}))

import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import {
  expirePendingBookingWithPolicy,
  sweepExpiredPendingBookings,
} from '@/modules/bookings/booking.expiry'
import { setExpiryScheduler } from '@/shared/jobs/schedule-expiry'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'
import { cleanupAll, createTestPlayer, createTestTenant, ensureRoles } from '../helpers/tenant'

const PRICING = {
  rules: [
    {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      from: '08:00',
      to: '23:00',
      price: 1000000,
    },
  ],
}
const FUTURE = '2099-08-10'

async function insertCourt(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO courts (tenant_id, name, capacity, pricing, status)
    VALUES (${tenantId}, 'C1', 10, ${sql.json(PRICING)}, 'online') RETURNING id
  `
  return rows[0]!.id
}

async function insertPending(
  sql: Sql,
  tenantId: string,
  courtId: string,
  playerId: string,
  ageSeconds: number,
  timeStart: string,
  timeEnd: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO bookings (
      tenant_id, court_id, player_id, date, time_start, time_end,
      starts_at, ends_at, type,
      status, price_snapshot, deposit_amount, deposit_status, payment_method, created_at
    ) VALUES (
      ${tenantId}, ${courtId}, ${playerId}, ${FUTURE}::date, ${timeStart}, ${timeEnd},
      (${FUTURE}::date + ${timeStart}::time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      (${FUTURE}::date + ${timeEnd}::time)   AT TIME ZONE 'America/Argentina/Buenos_Aires',
      'spontaneous', 'pending_payment', 1000000, 300000, 'pending', NULL,
      NOW() - (${ageSeconds} * INTERVAL '1 second')
    ) RETURNING id
  `
  return rows[0]!.id
}

async function insertInProcessPayment(
  sql: Sql,
  tenantId: string,
  bookingId: string,
  playerId: string,
): Promise<void> {
  await sql`
    INSERT INTO payments (tenant_id, booking_id, player_id, amount, currency, type, method, status, mp_payment_id)
    VALUES (${tenantId}, ${bookingId}, ${playerId}, 300000, 'ARS', 'deposit', 'mercadopago', 'in_process', ${String(Math.floor(Math.random() * 1e12))})
  `
}

async function statusOf(sql: Sql, bookingId: string): Promise<string> {
  const rows = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${bookingId}`
  return rows[0]!.status
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

beforeEach(() => setExpiryScheduler(null))
afterAll(async () => {
  setExpiryScheduler(null)
  await closeSql()
})

describe('expirePendingBookingWithPolicy', () => {
  it('expires a pending_payment booking past its 6min window with no in_process payment', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const bookingId = await insertPending(
      sql,
      tenant.id,
      courtId,
      player.id,
      20 * 60,
      '10:00',
      '11:00',
    )

    const action = await expirePendingBookingWithPolicy(bookingId)

    expect(action).toBe('expired')
    expect(await statusOf(sql, bookingId)).toBe('expired')
  })

  it('reschedules (does NOT expire) a booking still inside its 6min window', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const bookingId = await insertPending(
      sql,
      tenant.id,
      courtId,
      player.id,
      2 * 60,
      '12:00',
      '13:00',
    )

    const captured: Array<{ id: string; delay: number }> = []
    setExpiryScheduler(async (id, delay) => {
      captured.push({ id, delay })
    })

    const action = await expirePendingBookingWithPolicy(bookingId)

    expect(action).toBe('rescheduled')
    expect(await statusOf(sql, bookingId)).toBe('pending_payment')
    expect(captured).toHaveLength(1)
    // ~6min minus the 2min already elapsed.
    expect(captured[0]!.delay).toBeGreaterThan(60)
    expect(captured[0]!.delay).toBeLessThanOrEqual(DEFAULT_EXPIRY_SECONDS)
  })

  it('expires past the 6min window even with an in_process transfer (no 48h grace)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const bookingId = await insertPending(
      sql,
      tenant.id,
      courtId,
      player.id,
      20 * 60,
      '14:00',
      '15:00',
    )
    await insertInProcessPayment(sql, tenant.id, bookingId, player.id)

    const action = await expirePendingBookingWithPolicy(bookingId)

    expect(action).toBe('expired')
    expect(await statusOf(sql, bookingId)).toBe('expired')
  })

  it('is a no-op for an already-confirmed booking', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const bookingId = await insertPending(
      sql,
      tenant.id,
      courtId,
      player.id,
      20 * 60,
      '16:00',
      '17:00',
    )
    await sql`UPDATE bookings SET status = 'confirmed' WHERE id = ${bookingId}`

    const action = await expirePendingBookingWithPolicy(bookingId)

    expect(action).toBe('skipped')
    expect(await statusOf(sql, bookingId)).toBe('confirmed')
  })
})

describe('sweepExpiredPendingBookings', () => {
  it('expires overdue pending_payment bookings and leaves fresh ones', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const player = await createTestPlayer(sql)
    const courtId = await insertCourt(sql, tenant.id)
    const overdue = await insertPending(
      sql,
      tenant.id,
      courtId,
      player.id,
      20 * 60,
      '18:00',
      '19:00',
    )
    const fresh = await insertPending(sql, tenant.id, courtId, player.id, 60, '20:00', '21:00')

    const expired = await sweepExpiredPendingBookings()

    expect(expired).toBeGreaterThanOrEqual(1)
    expect(await statusOf(sql, overdue)).toBe('expired')
    expect(await statusOf(sql, fresh)).toBe('pending_payment')
  })
})
