/**
 * IDOR — admin route handlers (cross-tenant).
 *
 * Qué prueba este archivo y por qué existe aparte de isolation.test.ts:
 *  - isolation.test.ts ejercita las policies RLS a nivel SQL crudo.
 *  - ESTE archivo ejercita el STACK COMPLETO del route handler HTTP:
 *    parseRouteUuid → filtro app-level `eq(tenantId)` → RLS, todo junto,
 *    devolviendo el status code real que vería un atacante.
 *
 * Regla de oro de un test de seguridad: un negativo (404/409) NO prueba nada
 * por sí solo — un handler roto que SIEMPRE devuelve 404 lo pasaría. Por eso
 * cada negativo cross-tenant va anclado a un CONTROL POSITIVO que demuestra que
 * el mismo handler SÍ funciona para el dueño legítimo. Si el handler se rompe,
 * el control positivo cae; si la aislación se rompe, el negativo cae.
 */
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

let tenantA: { id: string }
let tenantB: { id: string }
let A: IsolationSeed
let B: IsolationSeed
let bookingOfB: string // confirmada, tenant B — víctima de los intentos cross-tenant
let bookingOfAConfirmed: string // confirmada, tenant A — usada por el control positivo de cancel
let staffOfA: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenantA = await createTestTenant(sql)
  tenantB = await createTestTenant(sql)
  A = await seedIsolationData(sql, tenantA.id)
  B = await seedIsolationData(sql, tenantB.id)
  staffOfA = A.staffUserId

  const playerB = await createTestPlayer(sql)
  await linkPlayerToTenant(sql, tenantB.id, playerB.id)
  bookingOfB = await insertBooking(sql, {
    tenantId: tenantB.id,
    courtId: B.courtId,
    playerId: playerB.id,
    timeStart: '21:00',
    timeEnd: '22:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })

  // Reserva propia de A en estado confirmado, para el control positivo de cancel
  // (debe poder cancelarse). Va en su propia fila para no acoplarse con los demás
  // tests ni depender del orden de ejecución.
  bookingOfAConfirmed = await insertBooking(sql, {
    tenantId: tenantA.id,
    courtId: A.courtId,
    playerId: A.playerId,
    timeStart: '19:00',
    timeEnd: '20:00',
    status: 'confirmed',
    depositStatus: 'not_required',
    depositAmount: 0,
  })
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// Inyecta identidad de tenant A + SET LOCAL ROLE authenticated para que aplique
// RLS (el DB de test conecta como superusuario postgres, que bypassearía RLS).
vi.mock('@/shared/middleware/with-tenant', () => ({
  withTenant: (handler: (req: NextRequest, user: { tenantId: string; staffUserId: string }, tx: unknown) => unknown) =>
    async (req: NextRequest) => {
      const tenantId = (globalThis as Record<string, unknown>).__AS_TENANT__ as string
      const staffUserId = (globalThis as Record<string, unknown>).__AS_STAFF__ as string
      const { getDb } = await import('@/shared/db/client')
      const { sql } = await import('drizzle-orm')
      return getDb().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE authenticated`)
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`)
        return handler(req, { tenantId, staffUserId }, tx)
      })
    },
}))

import { GET as readBooking, PATCH as patchBooking } from '@/app/api/bookings/[id]/route'
import { POST as cancelBooking } from '@/app/api/bookings/[id]/cancel/route'

// Lee la fila cruda como superusuario (bypassa RLS) para verificar el estado
// REAL persistido en DB, independiente de lo que devuelva el handler.
async function rawBooking(id: string) {
  const sql = getSql()
  const rows = await sql<
    {
      status: string
      deposit_status: string
      canceled_at: Date | null
      canceled_by: string | null
      canceled_reason: string | null
      notes_internal: string | null
    }[]
  >`SELECT status, deposit_status, canceled_at, canceled_by, canceled_reason, notes_internal
      FROM bookings WHERE id = ${id}`
  return rows[0]
}

async function adminAuditLogCount(bookingId: string): Promise<number> {
  const sql = getSql()
  const rows = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM audit_logs
    WHERE resource_id = ${bookingId} AND action = 'booking.canceled_by_admin'
  `
  return rows[0].n
}

describe('IDOR: admin route handlers (cross-tenant)', () => {
  beforeAll(() => {
    ;(globalThis as Record<string, unknown>).__AS_TENANT__ = tenantA.id
    ;(globalThis as Record<string, unknown>).__AS_STAFF__ = staffOfA
  })

  // ─── GET ────────────────────────────────────────────────────────
  it('GET: admin de A no puede leer la reserva de B y no filtra datos', async () => {
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}`)
    const res = await readBooking(req)

    expect(res.status).toBe(404)
    // Sin fuga: el body no trae el id de la reserva ajena bajo ninguna forma.
    const body = await res.text()
    expect(body).not.toContain(bookingOfB)
  })

  it('GET: admin de A sí lee su propia reserva (control positivo)', async () => {
    // Ancla el 404 de arriba: prueba que el handler NO está roto/siempre-404.
    const req = new NextRequest(`http://localhost/api/bookings/${A.bookingId}`)
    const res = await readBooking(req)

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string; court_id: string } }
    expect(json.data.id).toBe(A.bookingId)
    expect(json.data.court_id).toBe(A.courtId)
  })

  // ─── POST cancel ─────────────────────────────────────────────────
  it('cancel: admin de A no puede cancelar la reserva confirmada de B (sin mutación ni audit log)', async () => {
    const before = await rawBooking(bookingOfB)
    expect(before.status).toBe('confirmed')

    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'idor', cancellation_type: 'jugador' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelBooking(req)

    // La reserva de B es INVISIBLE para A (RLS en lockBooking), por lo que el
    // servicio lanza BookingNotInConfirmedError → 409. 404 también sería aceptable
    // si en el futuro se filtra antes; lo único inadmisible es 2xx.
    expect([404, 409]).toContain(res.status)
    expect(res.ok).toBe(false) // res.ok es true solo para 2xx: prohíbe cualquier éxito

    // Sin mutación de NINGÚN campo de cancelación, no solo del status.
    const after = await rawBooking(bookingOfB)
    expect(after.status).toBe('confirmed')
    expect(after.canceled_at).toBeNull()
    expect(after.canceled_by).toBeNull()
    expect(after.canceled_reason).toBeNull()

    // Efecto secundario: NO se escribió audit log de cancelación para la reserva ajena.
    expect(await adminAuditLogCount(bookingOfB)).toBe(0)
  })

  it('cancel: admin de A no puede cancelar la reserva de B ni como "complejo" (refund path bloqueado)', async () => {
    // El motivo "complejo" carga tenants.mp_access_token y resuelve gateway antes
    // de cancelar (reembolso forzado): hay que probar que TAMPOCO toca la reserva ajena.
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'idor-refund', cancellation_type: 'complejo' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelBooking(req)

    expect(res.ok).toBe(false)
    expect([404, 409]).toContain(res.status)

    const after = await rawBooking(bookingOfB)
    expect(after.status).toBe('confirmed')
    expect(after.canceled_at).toBeNull()
    expect(after.deposit_status ?? 'not_required').not.toBe('refunded')
    expect(await adminAuditLogCount(bookingOfB)).toBe(0)
  })

  it('cancel: admin de A sí cancela su propia reserva confirmada (control positivo)', async () => {
    // Ancla los negativos de cancel: prueba que el handler de cancelación
    // realmente funciona, transiciona estado y registra el audit log.
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfAConfirmed}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'lluvia', cancellation_type: 'complejo' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelBooking(req)

    expect(res.status).toBe(200)
    const after = await rawBooking(bookingOfAConfirmed)
    // "complejo" reembolsa siempre (sin seña → solo libera el turno).
    expect(after.status).toBe('canceled_refunded')
    expect(after.canceled_by).toBe('admin')
    expect(after.canceled_reason).toBe('Cancelado por el complejo: lluvia')
    expect(after.canceled_at).not.toBeNull()
    // El audit log de cancelación SÍ existe para la reserva propia.
    expect(await adminAuditLogCount(bookingOfAConfirmed)).toBe(1)
  })

  // ─── PATCH (notas) — superficie IDOR que antes no se testeaba ─────
  it('PATCH: admin de A no puede editar las notas internas de la reserva de B (notas intactas)', async () => {
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes_internal: 'pwned-by-tenant-A' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchBooking(req)

    expect(res.status).toBe(404)
    const after = await rawBooking(bookingOfB)
    expect(after.notes_internal).toBeNull() // la escritura cross-tenant no tocó nada
  })

  it('PATCH: admin de A sí edita las notas de su propia reserva (control positivo)', async () => {
    const note = 'cobrar seña pendiente'
    const req = new NextRequest(`http://localhost/api/bookings/${A.bookingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes_internal: note }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchBooking(req)

    expect(res.status).toBe(200)
    const after = await rawBooking(A.bookingId)
    expect(after.notes_internal).toBe(note)
  })
})
