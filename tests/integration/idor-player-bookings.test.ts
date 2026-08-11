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
// `__AS_PLAYER__` and run the handler inside a real player-scoped tx under the
// non-superuser `authenticated` role, so RLS (player_own_bookings_select) and
// FORCE ROW LEVEL SECURITY are the things actually being exercised — exactly the
// posture of a production app role. The test DB connects as the postgres
// superuser, which would otherwise bypass RLS entirely and make these tests lie.
vi.mock('@/server/middleware/with-player', () => ({
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

import { GET as readBookingStatus } from '@/app/api/player/bookings/[id]/status/route'

let tenant: { id: string; slug: string }
let seed: IsolationSeed
let playerA: { id: string }
let playerB: { id: string }
let bookingOfB: string
let ownReadBookingA: string

function status(bookingId: string, asPlayer: string) {
  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = asPlayer
  return readBookingStatus(
    new NextRequest(`http://localhost/api/player/bookings/${bookingId}/status`),
  )
}

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

  const confirmed = {
    tenantId: tenant.id,
    courtId: seed.courtId,
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  } as const

  bookingOfB = await insertBooking(sql, {
    ...confirmed,
    playerId: playerB.id,
    timeStart: '21:00',
    timeEnd: '22:00',
  })
  ownReadBookingA = await insertBooking(sql, {
    ...confirmed,
    playerId: playerA.id,
    timeStart: '20:00',
    timeEnd: '21:00',
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('GET /api/player/bookings/[id]/status', () => {
  // Misma forma de riesgo que el detalle: WHERE b.id sin filtro player_id en SQL,
  // RLS es la única barrera. Cubrimos control positivo + IDOR.
  it('un jugador consulta el estado de su propia reserva (200)', async () => {
    const res = await status(ownReadBookingA, playerA.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.status).toBe('confirmed')
    expect(data.depositStatus).toBe('not_required') // el payload de estado incluye la seña
    // expiresAt = created_at + 15min; debe ser un ISO válido, no undefined ni NaN.
    expect(typeof data.expiresAt).toBe('string')
    expect(Number.isNaN(Date.parse(data.expiresAt))).toBe(false)
  })

  it('un jugador NO puede consultar el estado de la reserva de otro (404)', async () => {
    const res = await status(bookingOfB, playerA.id)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).not.toHaveProperty('data')
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
