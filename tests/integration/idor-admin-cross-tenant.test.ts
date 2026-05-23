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
let bookingOfB: string
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
}, 30_000)

afterAll(async () => {
  await closeSql()
})

// Inject tenantA identity + SET LOCAL ROLE authenticated so RLS applies
// (test DB connects as postgres superuser, which would bypass RLS).
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

import { GET as readBooking } from '@/app/api/bookings/[id]/route'
import { POST as cancelBooking } from '@/app/api/bookings/[id]/cancel/route'

describe('IDOR: admin route handlers (cross-tenant)', () => {
  beforeAll(() => {
    ;(globalThis as Record<string, unknown>).__AS_TENANT__ = tenantA.id
    ;(globalThis as Record<string, unknown>).__AS_STAFF__ = staffOfA
  })

  it('GET /api/bookings/[id] for tenant B booking → 404', async () => {
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}`)
    const res = await readBooking(req)
    expect(res.status).toBe(404)
  })

  it('POST /api/bookings/[id]/cancel on tenant B booking → 404/409, no mutation', async () => {
    const req = new NextRequest(`http://localhost/api/bookings/${bookingOfB}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'idor', should_refund: false }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await cancelBooking(req)
    expect([404, 409]).toContain(res.status)

    const sql = getSql()
    const rows = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id = ${bookingOfB}`
    expect(rows[0].status).toBe('confirmed') // unchanged
  })
})
