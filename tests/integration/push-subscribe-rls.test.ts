/**
 * Integration test: push subscribe / unsubscribe scoping.
 *
 * Requires a running Supabase instance (`supabase start`) with DATABASE_URL set.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 *
 * Key invariant: the DELETE WHERE clause includes tenant_id + staff_user_id,
 * so Admin B cannot delete Admin A's subscription row.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
  // Also clean push_subscriptions (not in cleanupAll TRUNCATE list).
  await sql`DELETE FROM push_subscriptions`
}, 30_000)

afterAll(async () => {
  try {
    const sql = getSql()
    await sql`DELETE FROM push_subscriptions`
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

const ENDPOINT_A = 'https://push.example.com/sub/admin-a-endpoint'
const ENDPOINT_A2 = 'https://push.example.com/sub/admin-a-endpoint-2'

describe('push subscribe / unsubscribe RLS (F9 T4)', () => {
  it('Case 1: Admin A subscribe → DB row exists with correct tenant_id + staff_user_id', async () => {
    const sql = getSql()
    const tenantA = await createTestTenant(sql)
    const staffA = await createTestStaffUser(sql)

    const rows = await sql<{ id: string; tenant_id: string; staff_user_id: string }[]>`
      INSERT INTO push_subscriptions
        (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES
        (${tenantA.id}, ${staffA.id}, ${ENDPOINT_A}, ${'p256dh-key-a'}, ${'auth-key-a'})
      ON CONFLICT (endpoint) DO UPDATE SET
        tenant_id     = EXCLUDED.tenant_id,
        staff_user_id = EXCLUDED.staff_user_id,
        p256dh_key    = EXCLUDED.p256dh_key,
        auth_key      = EXCLUDED.auth_key,
        last_used_at  = now()
      RETURNING id, tenant_id, staff_user_id
    `

    expect(rows).toHaveLength(1)
    expect(rows[0]!.tenant_id).toBe(tenantA.id)
    expect(rows[0]!.staff_user_id).toBe(staffA.id)
  })

  it('Case 2: Admin A subscribe with same endpoint → UPSERT replaces (1 row total, updated last_used_at)', async () => {
    const sql = getSql()

    // First, ensure ENDPOINT_A has a row (from Case 1 or fresh insert).
    // Pull the real tenant_id + staff_user_id: ON CONFLICT DO UPDATE SET
    // tenant_id = EXCLUDED.tenant_id propagates the INSERT row's value, so the
    // proposed values must reference rows that exist (FK), not a placeholder.
    const beforeRows = await sql<
      { id: string; tenant_id: string; staff_user_id: string; last_used_at: Date | null }[]
    >`
      SELECT id, tenant_id, staff_user_id, last_used_at
      FROM push_subscriptions WHERE endpoint = ${ENDPOINT_A}
    `
    expect(beforeRows).toHaveLength(1)
    const originalId = beforeRows[0]!.id

    // Small delay to ensure timestamps differ meaningfully.
    await new Promise((r) => setTimeout(r, 10))

    const afterRows = await sql<{ id: string; last_used_at: Date | null }[]>`
      INSERT INTO push_subscriptions
        (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES
        (${beforeRows[0]!.tenant_id},
         ${beforeRows[0]!.staff_user_id},
         ${ENDPOINT_A}, ${'p256dh-key-a-v2'}, ${'auth-key-a-v2'})
      ON CONFLICT (endpoint) DO UPDATE SET
        tenant_id     = EXCLUDED.tenant_id,
        staff_user_id = EXCLUDED.staff_user_id,
        p256dh_key    = EXCLUDED.p256dh_key,
        auth_key      = EXCLUDED.auth_key,
        last_used_at  = now()
      RETURNING id, last_used_at
    `

    // Must still be 1 row total for ENDPOINT_A.
    const countRows = await sql<{ cnt: string }[]>`
      SELECT count(*) as cnt FROM push_subscriptions WHERE endpoint = ${ENDPOINT_A}
    `
    expect(Number(countRows[0]!.cnt)).toBe(1)
    expect(afterRows[0]!.id).toBe(originalId)
    expect(afterRows[0]!.last_used_at).not.toBeNull()
  })

  it('Case 3: Admin B DELETE on Admin A endpoint → returns 0 deleted (cross-tenant isolation)', async () => {
    const sql = getSql()

    // Create Admin B.
    const tenantB = await createTestTenant(sql)
    const staffB = await createTestStaffUser(sql)

    // Admin B tries to delete Admin A's endpoint.
    const deleted = await sql<{ id: string }[]>`
      DELETE FROM push_subscriptions
      WHERE endpoint      = ${ENDPOINT_A}
        AND tenant_id     = ${tenantB.id}
        AND staff_user_id = ${staffB.id}
      RETURNING id
    `

    expect(deleted).toHaveLength(0)

    // Admin A's row still exists.
    const remaining = await sql<{ cnt: string }[]>`
      SELECT count(*) as cnt FROM push_subscriptions WHERE endpoint = ${ENDPOINT_A}
    `
    expect(Number(remaining[0]!.cnt)).toBe(1)
  })

  it('Case 4: Admin A DELETE own endpoint → row gone', async () => {
    const sql = getSql()

    // Get Admin A's subscription to retrieve tenant_id + staff_user_id.
    const sub = await sql<{ tenant_id: string; staff_user_id: string }[]>`
      SELECT tenant_id, staff_user_id FROM push_subscriptions WHERE endpoint = ${ENDPOINT_A}
    `
    expect(sub).toHaveLength(1)
    const { tenant_id, staff_user_id } = sub[0]!

    // Insert a second subscription for Admin A.
    await sql`
      INSERT INTO push_subscriptions
        (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES
        (${tenant_id}, ${staff_user_id}, ${ENDPOINT_A2}, ${'p256dh-key-a'}, ${'auth-key-a'})
      ON CONFLICT (endpoint) DO NOTHING
    `

    // Admin A deletes ENDPOINT_A.
    const deleted = await sql<{ id: string }[]>`
      DELETE FROM push_subscriptions
      WHERE endpoint      = ${ENDPOINT_A}
        AND tenant_id     = ${tenant_id}
        AND staff_user_id = ${staff_user_id}
      RETURNING id
    `
    expect(deleted).toHaveLength(1)

    // Confirm ENDPOINT_A is gone but ENDPOINT_A2 still exists.
    const remaining = await sql<{ endpoint: string }[]>`
      SELECT endpoint FROM push_subscriptions
      WHERE endpoint IN (${ENDPOINT_A}, ${ENDPOINT_A2})
    `
    expect(remaining.map((r) => r.endpoint)).not.toContain(ENDPOINT_A)
    expect(remaining.map((r) => r.endpoint)).toContain(ENDPOINT_A2)

    // Cleanup.
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ${ENDPOINT_A2}`
  })
})
