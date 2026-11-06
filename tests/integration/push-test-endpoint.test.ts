/**
 * Integration test: POST /api/admin/push/test route.
 *
 * Mocks the auth boundary; hits real local pg-boss.
 * Requires a running Supabase instance (`supabase start`) with DATABASE_URL set.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/modules/auth/types'

// Auth boundary mock — must be hoisted before route import.
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(),
  extractRealAuthUser: vi.fn(),
}))

// Tenant status check in withTenant hits real DB — we don't need to mock it
// because we'll create a real tenant.

import { extractAuthUser, extractRealAuthUser } from '@/modules/auth/auth.middleware'
import { closeSql, getSql } from '@/shared/db/client'
import { getBoss, stopBoss } from '@/shared/jobs/boss'
import { POST as testPush } from '@/app/api/admin/push/test/route'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

const asUser = (user: AuthUser | null) => {
  vi.mocked(extractAuthUser).mockResolvedValue(user)
  vi.mocked(extractRealAuthUser).mockResolvedValue(user)
}

// Shared test data created in beforeAll.
let tenantId: string
let staffUserId: string

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
  await sql`DELETE FROM push_subscriptions`

  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  // withTenant() revalida el rol contra tenant_staff_members (no el JWT):
  // sin este link, getStaffRole() devuelve null → 403 antes del handler.
  await linkStaffToTenant(sql, tenant.id, staff.id)
  tenantId = tenant.id
  staffUserId = staff.id

  // Ensure pg-boss schema exists.
  await getBoss()
}, 30_000)

afterAll(async () => {
  try {
    await stopBoss()
    await closeSql()
  } catch {
    // best-effort
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
  it('rechaza un dispositivo de otro miembro del complejo sin encolar el aviso', async () => {
    const sql = getSql()
    const otherStaff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenantId, otherStaff.id)
    const [subscription] = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id,staff_user_id,endpoint,p256dh_key,auth_key)
      VALUES (${tenantId},${otherStaff.id},${`https://fcm.googleapis.com/device-${crypto.randomUUID()}`},'key','auth') RETURNING id
    `
    await sql`DELETE FROM pgboss_v12.job WHERE name = 'push-send'`
    asUser(makeAdminUser(tenantId, staffUserId))
    const response = await testPush(
      new Request('http://localhost/api/admin/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriptionId: subscription!.id }),
      }) as never,
    )
    expect(response.status).toBe(403)
    // Cola operacional: se consulta como admin deliberadamente, no es dato tenant-scoped.
    expect(await sql`SELECT id FROM pgboss_v12.job WHERE name='push-send'`).toHaveLength(0)
    await sql`DELETE FROM push_subscriptions WHERE id=${subscription!.id}`
  })

  it('la prueba focalizada encola solamente el dispositivo elegido', async () => {
    const sql = getSql()
    const subs = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id,staff_user_id,endpoint,p256dh_key,auth_key) VALUES
      (${tenantId},${staffUserId},${`https://fcm.googleapis.com/device-${crypto.randomUUID()}`},'key','auth'),
      (${tenantId},${staffUserId},${`https://fcm.googleapis.com/device-${crypto.randomUUID()}`},'key','auth') RETURNING id
    `
    await sql`DELETE FROM pgboss_v12.job WHERE name='push-send'`
    asUser(makeAdminUser(tenantId, staffUserId))
    const response = await testPush(
      new Request('http://localhost/api/admin/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriptionId: subs[0]!.id }),
      }) as never,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, dispatched: 1 })
    // El id de dispositivo pertenece al payload de infraestructura de pg-boss.
    const jobs = await sql<
      { data: { subscription_id: string } }[]
    >`SELECT data FROM pgboss_v12.job WHERE name='push-send'`
    expect(jobs.map((job) => job.data.subscription_id)).toEqual([subs[0]!.id])
    for (const sub of subs) await sql`DELETE FROM push_subscriptions WHERE id=${sub.id}`
    await sql`DELETE FROM pgboss_v12.job WHERE name='push-send'`
  })
  it('Case 1: admin has 0 subscriptions → returns {success:true, dispatched: 0}', async () => {
    asUser(makeAdminUser(tenantId, staffUserId))

    const req = new Request('http://localhost/api/admin/push/test', { method: 'POST' })
    const res = await testPush(req as never)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { success: boolean; dispatched: number }
    expect(json.success).toBe(true)
    expect(json.dispatched).toBe(0)
  })

  it('Case 2: admin has 2 subscriptions → returns dispatched=2 + pgboss has 2 push-send rows', async () => {
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
    await sql`DELETE FROM pgboss_v12.job WHERE name = 'push-send'`

    asUser(makeAdminUser(tenantId, staffUserId))

    const req = new Request('http://localhost/api/admin/push/test', { method: 'POST' })
    const res = await testPush(req as never)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { success: boolean; dispatched: number }
    expect(json.success).toBe(true)
    expect(json.dispatched).toBe(2)

    // Assert 2 rows in pgboss_v12.job with name='push-send'.
    const jobs = await sql<{ id: string }[]>`
      SELECT id FROM pgboss_v12.job WHERE name = 'push-send'
    `
    expect(jobs).toHaveLength(2)

    // Cleanup.
    await sql`DELETE FROM push_subscriptions WHERE endpoint IN (${ep1}, ${ep2})`
    await sql`DELETE FROM pgboss_v12.job WHERE name = 'push-send'`
  })
})
