import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestPlayer,
  createTestTenant,
  ensureRoles,
  linkPlayerToTenant,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'
import { insertBooking } from '../helpers/factories'

// withPlayer normally reads identity from the Supabase session. Here we inject
// `__AS_PLAYER__` and run the handler inside a real player-scoped tx so RLS
// (player_own_bookings_select) is the thing being exercised.
vi.mock('@/shared/middleware/with-player', () => ({
  withPlayer: (handler: (req: NextRequest, user: { playerId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const playerId = (globalThis as Record<string, unknown>).__AS_PLAYER__ as string
      const { getDb } = await import('@/shared/db/client')
      const { sql } = await import('drizzle-orm')
      // SET LOCAL ROLE authenticated so RLS applies (the test DB connects as the
      // postgres superuser, which would otherwise bypass RLS entirely).
      return getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE authenticated`)
        await tx.execute(sql`SELECT set_config('app.current_player_id', ${playerId}, true)`)
        return handler(req, { playerId }, tx)
      })
    },
}))

import { GET as readPlayerBooking } from '@/app/api/player/bookings/[id]/route'
import { POST as cancelPlayerBooking } from '@/app/api/player/bookings/[id]/cancel/route'

let tenant: { id: string }
let seed: IsolationSeed
let playerA: { id: string }
let playerB: { id: string }
let bookingOfB: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
  playerA = await createTestPlayer(sql)
  playerB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenant.id, playerA.id)
  await linkPlayerToTenant(sql, tenant.id, playerB.id)
  bookingOfB = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: playerB.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('IDOR: player route handlers', () => {
  it('GET /api/player/bookings/[id] as A cannot read B booking → 404', async () => {
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = playerA.id
    const req = new NextRequest(`http://localhost/api/player/bookings/${bookingOfB}`)
    const res = await readPlayerBooking(req)
    expect(res.status).toBe(404)
  })

  it('POST /api/player/bookings/[id]/cancel as A on B booking → 404 or 403, no mutation', async () => {
    ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = playerA.id
    const req = new NextRequest(`http://localhost/api/player/bookings/${bookingOfB}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'idor' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelPlayerBooking(req)
    expect([403, 404]).toContain(res.status)

    const sql = getSql()
    const rows = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${bookingOfB}`
    expect(rows[0].status).toBe('confirmed') // unchanged
  })
})
