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
import { insertBooking, insertCourt } from '../helpers/factories'

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
import { GET as listPlayerBookings } from '@/app/api/player/bookings/route'

let tenant: { id: string; slug: string }
let tenantB: { id: string; slug: string }
let seed: IsolationSeed
let playerA: { id: string }
let playerB: { id: string }
let bookingOfB: string
let ownReadBookingA: string
let ownCancelBookingA: string
let completedBookingA: string
let crossTenantBookingA: string
let historyBookingA: string
let courtName: string
let courtNameB: string

function get(bookingId: string, asPlayer: string) {
  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = asPlayer
  return readPlayerBooking(new NextRequest(`http://localhost/api/player/bookings/${bookingId}`))
}

function list(asPlayer: string, tab?: string) {
  ;(globalThis as Record<string, unknown>).__AS_PLAYER__ = asPlayer
  const url = tab
    ? `http://localhost/api/player/bookings?tab=${tab}`
    : 'http://localhost/api/player/bookings'
  return listPlayerBookings(new NextRequest(url))
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

  // Segundo complejo. Los jugadores son cross-tenant: reserva de playerA en tenantB
  // para probar que "Mis Reservas" resuelve canchas de varios complejos bajo RLS de
  // jugador. player_read_court es tenant-agnóstico y la ruta NO setea
  // app.current_tenant_id en el listado, así que esto ejercita ese diseño.
  tenantB = await createTestTenant(sql)
  const courtB = await insertCourt(sql, tenantB.id)
  await linkPlayerToTenant(sql, tenantB.id, playerA.id)
  crossTenantBookingA = await insertBooking(sql, {
    tenantId: tenantB.id,
    courtId: courtB,
    playerId: playerA.id,
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
    timeStart: '21:00',
    timeEnd: '22:00',
  })

  // Reserva pasada de playerA (mismo court del seed) para el branch tab=history del route.
  const pastDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  historyBookingA = await insertBooking(sql, {
    tenantId: tenant.id,
    courtId: seed.courtId,
    playerId: playerA.id,
    date: pastDate,
    timeStart: '14:00',
    timeEnd: '15:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })

  // Nombres reales de cancha para aserciones exactas (no `toBeTruthy`): probar que el
  // JOIN devuelve LA cancha correcta, no una cualquiera.
  const [c1] = await sql<{ name: string }[]>`SELECT name FROM courts WHERE id = ${seed.courtId}`
  const [c2] = await sql<{ name: string }[]>`SELECT name FROM courts WHERE id = ${courtB}`
  courtName = c1!.name
  courtNameB = c2!.name
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
    expect(data.booking.court_name).toBe(courtName) // el JOIN a courts resolvió A LA cancha correcta
    expect(data.booking.tenant_slug).toBe(tenant.slug)
  })

  it('un jugador NO puede leer la reserva de otro jugador (404, sin filtrar payload)', async () => {
    const res = await get(bookingOfB, playerA.id)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).not.toHaveProperty('data') // cero leak de la reserva ajena
    expect(body.error.code).toBe('NOT_FOUND') // 404 genuino, no un 200 con payload vacío
  })

  it('rechaza un id con formato inválido con 400 antes de tocar la DB', async () => {
    const res = await get('not-a-uuid', playerA.id)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_ID') // 400 por validación de UUID, no por otra causa
  })
})

describe('GET /api/player/bookings (mis-reservas)', () => {
  // Control crítico: bajo RLS de jugador, courts solo es legible vía la policy
  // player_read_court (EXISTS sobre bookings propias). Sin ella el JOIN courts se
  // vacía y la pantalla del jugador queda en blanco (bookings.length === 0).
  type ListedBooking = { id: string; court_name: string; tenant_slug: string }

  it('un jugador ve sus reservas con el nombre de la cancha resuelto', async () => {
    const res = await list(playerA.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    const rows = data.bookings as ListedBooking[]
    const own = rows.find((b) => b.id === ownReadBookingA)
    expect(own).toBeDefined()
    expect(own!.court_name).toBe(courtName) // el JOIN a courts resolvió A LA cancha correcta bajo RLS
    expect(own!.tenant_slug).toBe(tenant.slug)
  })

  it('el listado de un jugador no incluye reservas de otro jugador', async () => {
    const res = await list(playerA.id)
    const { data } = await res.json()
    const ids = (data.bookings as ListedBooking[]).map((b) => b.id)
    expect(ids).not.toContain(bookingOfB)
  })

  // GAP cerrado: los jugadores son cross-tenant. Sin esto, "Mis Reservas" solo se
  // probaba con UN complejo y una regresión que rompiera la resolución de canchas en
  // un segundo complejo (p.ej. reintroducir un filtro por app.current_tenant_id en el
  // JOIN courts) pasaría inadvertida.
  it('Mis Reservas resuelve canchas de varios complejos para un jugador cross-tenant', async () => {
    const res = await list(playerA.id)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    const byId = new Map((data.bookings as ListedBooking[]).map((b) => [b.id, b]))

    const local = byId.get(ownReadBookingA)
    const cross = byId.get(crossTenantBookingA)
    expect(local).toBeDefined()
    expect(cross).toBeDefined() // la reserva del segundo complejo aparece en el mismo listado
    expect(local!.court_name).toBe(courtName)
    expect(local!.tenant_slug).toBe(tenant.slug)
    expect(cross!.court_name).toBe(courtNameB) // cancha del 2º complejo resuelta sin tenant context
    expect(cross!.tenant_slug).toBe(tenantB.slug)
  })

  // GAP cerrado: el branch tab=history del route (date < NOW) nunca se ejercitaba a
  // nivel de ruta — solo había una query cruda equivalente en player-app.test.ts.
  it('el tab=history devuelve reservas pasadas (con cancha resuelta) y excluye las futuras', async () => {
    const res = await list(playerA.id, 'history')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    const rows = data.bookings as ListedBooking[]
    const ids = rows.map((b) => b.id)
    expect(ids).toContain(historyBookingA)
    expect(ids).not.toContain(ownReadBookingA) // reserva futura → fuera del tab history
    const hist = rows.find((b) => b.id === historyBookingA)
    expect(hist!.court_name).toBe(courtName) // JOIN courts resuelto también para una reserva pasada
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

  it('rechaza cancelar una reserva que no está confirmada (409), sin mutación ni audit log', async () => {
    const res = await cancel(completedBookingA, playerA.id)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CONFLICT')

    const sql = getSql()
    const [b] = await sql<{ status: string; canceled_at: string | null }[]>`
      SELECT status, canceled_at FROM bookings WHERE id = ${completedBookingA}`
    expect(b.status).toBe('completed') // transición inválida no avanza la máquina de estados
    expect(b.canceled_at).toBeNull() // ni siquiera marca canceled_at

    const audits = await sql<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE resource_id = ${completedBookingA} AND action = 'booking.canceled'`
    expect(audits).toHaveLength(0) // la transición rechazada no deja audit log
  })

  it('un jugador cancela su propia reserva confirmada fuera de ventana de penalidad: 200, canceled_refunded y audit', async () => {
    // ownCancelBookingA arranca a +7 días (default del factory) y la política default
    // es hours_before=12 → 168h > 12h → inPolicy → canceled_refunded EXACTO (no regex).
    const res = await cancel(ownCancelBookingA, playerA.id, 'no puedo ir')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.status).toBe('canceled_refunded') // valor exacto: una política invertida fallaría acá
    expect(data.canceledBy).toBe('player')
    expect(data.depositStatus).toBe('not_required') // sin seña no inventa refund de seña

    const sql = getSql()
    const [b] = await sql<{ status: string; canceled_by: string | null; canceled_reason: string | null }[]>`
      SELECT status, canceled_by, canceled_reason FROM bookings WHERE id = ${ownCancelBookingA}`
    expect(b.status).toBe('canceled_refunded') // canceled, una L
    expect(b.canceled_by).toBe('player')
    expect(b.canceled_reason).toBe('no puedo ir') // el motivo del jugador se persiste

    const audits = await sql<{ metadata: { inPolicy: boolean; depositStatus: string } }[]>`
      SELECT metadata FROM audit_logs WHERE resource_id = ${ownCancelBookingA} AND action = 'booking.canceled'`
    expect(audits).toHaveLength(1)
    expect(audits[0]!.metadata.inPolicy).toBe(true) // el audit registra que cayó dentro de política
  })
})
