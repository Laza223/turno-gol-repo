/**
 * BK-04 — date window validation at the /api/player/bookings POST route.
 *
 * Verifies that the route returns 422 DATE_OUT_OF_RANGE when the player
 * attempts to book a date outside the allowed window (past or beyond
 * booking_advance_days). Tests run against a real DB tenant so the tenant
 * lookup inside the handler succeeds; no court needed because the service
 * rejects before the court lock.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'

// withPlayer normally validates Supabase session. In tests we short-circuit
// it using the same pattern as idor-player-bookings.test.ts: read __AS_PLAYER__
// from globalThis and run the handler inside a real player-scoped tx.
vi.mock('@/shared/middleware/with-player', () => ({
  withPlayer:
    (handler: (req: NextRequest, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const playerId = (globalThis as Record<string, unknown>).__AS_PLAYER__ as string
      const { getDb } = await import('@/shared/db/client')
      const { sql } = await import('drizzle-orm')
      return getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE authenticated`)
        await tx.execute(sql`SELECT set_config('app.current_player_id', ${playerId}, true)`)
        return handler(req, { playerId }, tx)
      })
    },
}))

// Import AFTER vi.mock so the mock is in place when the module is loaded.
import { POST as createBooking } from '@/app/api/player/bookings/route'

let tenant: { id: string; slug: string }
let playerId: string

// A valid-looking UUID for court_id — no real court needed for date-rejection tests.
const FAKE_COURT_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function artTodayStr(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  const player = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, player.id)
  playerId = player.id
}, 30_000)

afterAll(async () => closeSql())

function makeBookingRequest(overrides: {
  date: string
  time_start?: string
  time_end?: string
  duration_mins?: 60 | 120
}): NextRequest {
  return new NextRequest('http://localhost/api/player/bookings', {
    method: 'POST',
    body: JSON.stringify({
      tenant_slug: tenant.slug,
      court_id: FAKE_COURT_UUID,
      date: overrides.date,
      time_start: overrides.time_start ?? '10:00',
      time_end: overrides.time_end ?? '11:00',
      duration_mins: overrides.duration_mins ?? 60,
    }),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/player/bookings: date window validation (BK-04)', () => {
  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = playerId
  })

  it('returns 422 DATE_OUT_OF_RANGE when date is yesterday', async () => {
    const yesterday = addDaysStr(artTodayStr(), -1)
    const res = await createBooking(makeBookingRequest({ date: yesterday }))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('DATE_OUT_OF_RANGE')
  })

  it('returns 422 DATE_OUT_OF_RANGE when date is 30 days from now (beyond advance window)', async () => {
    const farFuture = addDaysStr(artTodayStr(), 30)
    const res = await createBooking(makeBookingRequest({ date: farFuture }))
    expect(res.status).toBe(422)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('DATE_OUT_OF_RANGE')
  })
})
