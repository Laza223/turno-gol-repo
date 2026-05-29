/**
 * Integration test: POST /api/admin/push/test route.
 *
 * Mocks the auth boundary; hits real local pg-boss.
 * Requires a running Supabase instance (`supabase start`) with DATABASE_URL set.
 * Skips gracefully if DB is not available.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Auth boundary mock — must be hoisted before route import.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))

// Tenant status check in withTenant hits real DB — we don't need to mock it
// because we'll create a real tenant.

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql } from '@/shared/db/client'
import { getBoss, stopBoss } from '@/shared/jobs/boss'
import { POST as testPush } from '@/app/api/admin/push/test/route'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

const asUser = (user: AuthUser | null) =>
  vi.mocked(extractAuthUser).mockResolvedValue(user)

let dbAvailable = false

// Shared test data created in beforeAll.
let tenantId: string
let staffUserId: string

beforeAll(async () => {
  try {
    const sql = getSql()
    await sql`SELECT 1`
    dbAvailable = true
    await ensureRoles(sql)
    await cleanupAll(sql)
    await sql`DELETE FROM push_subscriptions`

    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    tenantId = tenant.id
    staffUserId = staff.id

    // Ensure pg-boss schema exists.
    await getBoss()
  } catch {
    dbAvailable = false
  }
}, 30_000)

afterAll(async () => {
  if (dbAvailable) {
    try {
      await stopBoss()
      await closeSql()
    } catch {
      // best-effort
    }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeAdminUser(tId: string, sId: string): AuthUser {
  return {
    type: 'staff',
    id: 'auth-uuid-test',
    email: 'admin@test.local',
    staffUserId: sId,
    tenantId: tId,
    role: 'admin',
  }
}

describe('POST /api/admin/push/test (F9 T4)', () => {
  it('Case 1: admin has 0 subscriptions → returns {success:true, dispatched: 0}', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: Supabase not running')
      return
    }

    asUser(makeAdminUser(tenantId, staffUserId))

    const req = new Request('http://localhost/api/admin/push/test', { method: 'POST' })
    const res = await testPush(req as never)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; dispatched: number }
    expect(json.success).toBe(true)
    expect(json.dispatched).toBe(0)
  })

  it('Case 2: admin has 2 subscriptions → returns dispatched=2 + pgboss has 2 push-send rows', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: Supabase not running')
      return
    }

    const sql = getSql()

    // Insert 2 push subscriptions for this admin.
    const ep1 = 'https://push.example.com/test-endpoint-sub-1'
    const ep2 = 'https://push.example.com/test-endpoint-sub-2'
    await sql`
      INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES
        (${tenantId}, ${staffUserId}, ${ep1}, ${'p256dh-1'}, ${'auth-1'}),
        (${tenantId}, ${staffUserId}, ${ep2}, ${'p256dh-2'}, ${'auth-2'})
      ON CONFLICT (endpoint) DO NOTHING
    `

    // Clear any existing push-send jobs for a clean count.
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`

    asUser(makeAdminUser(tenantId, staffUserId))

    const req = new Request('http://localhost/api/admin/push/test', { method: 'POST' })
    const res = await testPush(req as never)
    expect(res.status).toBe(200)
    const json = await res.json() as { success: boolean; dispatched: number }
    expect(json.success).toBe(true)
    expect(json.dispatched).toBe(2)

    // Assert 2 rows in pgboss.job with name='push-send'.
    const jobs = await sql<{ id: string }[]>`
      SELECT id FROM pgboss.job WHERE name = 'push-send'
    `
    expect(jobs).toHaveLength(2)

    // Cleanup.
    await sql`DELETE FROM push_subscriptions WHERE endpoint IN (${ep1}, ${ep2})`
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`
  })
})
