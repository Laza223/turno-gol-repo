import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { closeSql, getSql } from '@/shared/db/client'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenant: { id: string }
let seed: IsolationSeed

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  seed = await seedIsolationData(sql, tenant.id)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

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
import { GET as readCourt, PATCH as patchCourt } from '@/app/api/courts/[id]/route'

describe('API adversarial input — [id] params without Zod validation (B7.2 + B7.4)', () => {
  beforeAll(() => {
    ;(globalThis as Record<string, unknown>).__AS_TENANT__ = tenant.id
    ;(globalThis as Record<string, unknown>).__AS_STAFF__ = seed.staffUserId
  })

  it('GET /api/bookings/[id] with malformed UUID → 400 (not 500)', async () => {
    const req = new NextRequest('http://localhost/api/bookings/not-a-uuid')
    const res = await readBooking(req)
    // Without UUID validation, postgres throws "invalid input syntax for type uuid"
    // and the handler bubbles a 500. Expect 400/404 for graceful rejection.
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it('GET /api/bookings/[id] with SQL injection attempt → 400 (not 500)', async () => {
    const req = new NextRequest("http://localhost/api/bookings/' OR '1'='1")
    const res = await readBooking(req)
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it('GET /api/bookings/[id] with path traversal attempt → 400 (not 500)', async () => {
    const req = new NextRequest('http://localhost/api/bookings/..%2F..%2Fetc%2Fpasswd')
    const res = await readBooking(req)
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it('PATCH /api/bookings/[id] with malformed UUID → 400 (not 500)', async () => {
    const req = new NextRequest('http://localhost/api/bookings/garbage', {
      method: 'PATCH',
      body: JSON.stringify({ notes_internal: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchBooking(req)
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it('GET /api/courts/[id] with malformed UUID → 400 (not 500)', async () => {
    const req = new NextRequest('http://localhost/api/courts/not-uuid')
    const res = await readCourt(req)
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it('PATCH /api/courts/[id] with malformed UUID → 400 (not 500)', async () => {
    const req = new NextRequest('http://localhost/api/courts/garbage', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchCourt(req)
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it('PATCH /api/bookings/[id] with invalid JSON → 400', async () => {
    const validUuid = '00000000-0000-0000-0000-000000000001'
    const req = new NextRequest(`http://localhost/api/bookings/${validUuid}`, {
      method: 'PATCH',
      body: 'not json {{{',
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchBooking(req)
    expect(res.status).toBe(400)
  })

  it('PATCH /api/bookings/[id] with oversized notes (>2000 chars) → 422 validation error', async () => {
    const validUuid = '00000000-0000-0000-0000-000000000001'
    const req = new NextRequest(`http://localhost/api/bookings/${validUuid}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes_internal: 'x'.repeat(2001) }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await patchBooking(req)
    expect(res.status).toBe(422)
  })
})
