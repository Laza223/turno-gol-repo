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
vi.mock('@/shared/middleware/with-player', () => ({
  withPlayer: (handler: (req: NextRequest, user: { playerId: string }, tx: unknown) => unknown) =>
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

import { GET as readPlayerBooking } from '@/app/api/player/bookings/[id]/route'
import { POST as cancelPlayerBooking } from '@/app/api/player/bookings/[id]/cancel/route'
import { GET as readBookingStatus } from '@/app/api/player/bookings/[id]/status/route'

let tenant: { id: string }
let seed: IsolationSeed
let playerA: { id: string }
let playerB: { id: string }
let bookingOfB: string
let ownReadBookingA: string
let ownCancelBookingA: string
let completedBookingA: string

function get(bookingId: string, asPlayer: string) {
  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = asPlayer
  return readPlayerBooking(new NextRequest(`http://localhost/api/player/bookings/${bookingId}`))
}

function status(bookingId: string, asPlayer: string) {
  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = asPlayer
  return readBookingStatus(
    new NextRequest(`http://localhost/api/player/bookings/${bookingId}/status`),
  )
}

function cancel(bookingId: string, asPlayer: string, reason = 'motivo') {
  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = asPlayer
  return cancelPlayerBooking(
    new NextRequest(`http://localhost/api/player/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      headers: { 'content-type': 'application/json' },
    }),
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

  bookingOfB = await insertBooking(sql, { ...confirmed, playerId: playerB.id, timeStart: '21:00', timeEnd: '22:00' })
  ownReadBookingA = await insertBooking(sql, { ...confirmed, playerId: playerA.id, timeStart: '20:00', timeEnd: '21:00' })
  ownCancelBookingA = await insertBooking(sql, { ...confirmed, playerId: playerA.id, timeStart: '19:00', timeEnd: '20:00' })
  completedBookingA = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: playerA.id,
    timeStart: '18:00',
    timeEnd: '19:00',
    status: 'completed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

describe('GET /api/player/bookings/[id]', () => {
  // Control positivo: sin esto, un 404 incondicional (p.ej. el JOIN courts
  // bloqueado por RLS) haría pasar el test de IDOR por la razón equivocada.
  it('un jugador lee su propia reserva con el payload completo', async () => {
    const res = await get(ownReadBookingA, playerA.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.booking.id).toBe(ownReadBookingA)
    expect(data.booking.status).toBe('confirmed')
    expect(data.booking.court_name).toBeTruthy() // prueba que el JOIN a courts resolvió
    expect(data.booking.tenant_slug).toBeTruthy()
  })

  it('un jugador NO puede leer la reserva de otro jugador (404, sin filtrar payload)', async () => {
    const res = await get(bookingOfB, playerA.id)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).not.toHaveProperty('data') // cero leak de la reserva ajena
  })

  it('rechaza un id con formato inválido con 400 antes de tocar la DB', async () => {
    const res = await get('not-a-uuid', playerA.id)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/player/bookings/[id]/status', () => {
  // Misma forma de riesgo que el detalle: WHERE b.id sin filtro player_id en SQL,
  // RLS es la única barrera. Cubrimos control positivo + IDOR.
  it('un jugador consulta el estado de su propia reserva (200)', async () => {
    const res = await status(ownReadBookingA, playerA.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.status).toBe('confirmed')
  })

  it('un jugador NO puede consultar el estado de la reserva de otro (404)', async () => {
    const res = await status(bookingOfB, playerA.id)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).not.toHaveProperty('data')
  })
})

describe('POST /api/player/bookings/[id]/cancel', () => {
  it('un jugador no puede cancelar la reserva de otro: 404, sin mutación ni audit log', async () => {
    const res = await cancel(bookingOfB, playerA.id, 'idor')
    expect(res.status).toBe(404) // la barrera real es el pre-read RLS, no un OR difuso 403/404

    const sql = getSql()
    const [b] = await sql<{ status: string; canceled_at: string | null }[]>`
      SELECT status, canceled_at FROM bookings WHERE id = ${bookingOfB}`
    expect(b.status).toBe('confirmed')
    expect(b.canceled_at).toBeNull()

    const audits = await sql<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE resource_id = ${bookingOfB} AND action = 'booking.canceled'`
    expect(audits).toHaveLength(0) // el intento IDOR no deja rastro de cancelación
  })

  it('rechaza cancelar una reserva que no está confirmada (409), sin mutación', async () => {
    const res = await cancel(completedBookingA, playerA.id)
    expect(res.status).toBe(409)

    const sql = getSql()
    const [b] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${completedBookingA}`
    expect(b.status).toBe('completed') // transición inválida no avanza la máquina de estados
  })

  it('un jugador cancela su propia reserva confirmada: 200, estado canceled y audit log', async () => {
    const res = await cancel(ownCancelBookingA, playerA.id, 'no puedo ir')
    expect(res.status).toBe(200)

    const sql = getSql()
    const [b] = await sql<{ status: string; canceled_by: string | null }[]>`
      SELECT status, canceled_by FROM bookings WHERE id = ${ownCancelBookingA}`
    expect(b.status).toMatch(/^canceled_(refunded|no_refund)$/) // canceled, una L
    expect(b.canceled_by).toBe('player')

    const audits = await sql<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE resource_id = ${ownCancelBookingA} AND action = 'booking.canceled'`
    expect(audits).toHaveLength(1)
  })
})
