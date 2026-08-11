/**
 * Integration test: push.worker 410-gone → subscription row deleted.
 *
 * When sendPushNotification returns { success: false, gone: true, statusCode: 410 },
 * handlePushSendJob must DELETE the push_subscriptions row so stale endpoints
 * are garbage-collected and never retried.
 *
 * Requires a running Supabase instance (`supabase start`) with DATABASE_URL set.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Mock web-push BEFORE importing the worker so the module resolver picks up
// the mock instead of the real lib. Hoisting is handled by vitest.
vi.mock('@/lib/web-push', () => ({
  sendPushNotification: vi.fn(),
}))

import type { Job } from 'pg-boss'
import { sendPushNotification } from '@/lib/web-push'
import { handlePushSendJob } from '@/shared/jobs/workers/push.worker'
import { closeSql, getSql } from '@/shared/db/client'
import { type PushSendJobData } from '@/shared/jobs/definitions'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
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

describe('push.worker 410-gone cleanup (F9 T6)', () => {
  it('deletes push_subscriptions row when sendPushNotification returns gone=true (410)', async () => {
    // Mock sendPushNotification to simulate a 410 Gone response.
    vi.mocked(sendPushNotification).mockResolvedValueOnce({
      success: false,
      gone: true,
      statusCode: 410,
    })

    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)

    // Seed 1 push_subscriptions row.
    const subRows = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES (
        ${tenant.id},
        ${staff.id},
        ${'https://push.example.com/410-cleanup-test'},
        ${'p256dh-410-test'},
        ${'auth-410-test'}
      )
      RETURNING id
    `
    const subId = subRows[0]!.id

    // Confirm the row exists before calling the worker.
    const before = await sql<{ cnt: string }[]>`
      SELECT count(*) AS cnt FROM push_subscriptions WHERE id = ${subId}
    `
    expect(Number(before[0]!.cnt)).toBe(1)

    // Build a fake pg-boss job matching the PushSendJobData shape.
    const fakeJob = {
      id: 'fake-job-id-410',
      name: 'push-send',
      data: {
        subscription_id: subId,
        payload: { type: 'test' },
      } satisfies PushSendJobData,
    } as Job<PushSendJobData>

    // Call the worker directly — should delete the row.
    await handlePushSendJob(fakeJob)

    // Assert: the push_subscriptions row must be gone.
    const after = await sql<{ cnt: string }[]>`
      SELECT count(*) AS cnt FROM push_subscriptions WHERE id = ${subId}
    `
    expect(Number(after[0]!.cnt)).toBe(0)
  })
})
