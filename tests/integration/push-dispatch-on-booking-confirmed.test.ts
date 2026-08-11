/**
 * Integration test: notifyAdminPush → pg-boss queue depth assertion.
 *
 * Requires a running Supabase instance (`supabase start`) with DATABASE_URL set.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getBoss, stopBoss } from '@/shared/jobs/boss'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

const SAMPLE_PAYLOAD = {
  type: 'booking.confirmed_online',
  bookingId: 'b-test-1',
  courtName: 'Cancha 1',
  dateLabel: '3 de junio',
  timeLabel: '18:00–19:00',
  // Sin prefijo `/admin`: es un route group de Next, la URL real es `/grilla`.
  url: '/grilla?date=2026-06-03&highlight=b-test-1',
} as const

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
  // Ensure pg-boss schema exists by starting boss
  await getBoss()
}, 30_000)

afterAll(async () => {
  try {
    await stopBoss()
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

describe('push-dispatch integration', () => {
  it('enqueues 1 pg-boss job with name push-send after notifyAdminPush', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)

    // Insert a push_subscriptions row for this tenant/staff.
    const subRows = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES (
        ${tenant.id},
        ${staff.id},
        ${'https://push.example.com/test-sub'},
        ${'p256dh-test-key'},
        ${'auth-test-key'}
      )
      RETURNING id
    `
    const subId = subRows[0]!.id

    // Clear any existing push-send jobs to get a clean count.
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`

    const result = await notifyAdminPush(tenant.id, SAMPLE_PAYLOAD)
    expect(result.enqueued).toBe(1)

    // Assert 1 row in pgboss.job with name='push-send'.
    const jobs = await sql<{ id: string; data: unknown }[]>`
      SELECT id, data FROM pgboss.job
      WHERE name = 'push-send'
        AND data->>'subscription_id' = ${subId}
    `
    expect(jobs).toHaveLength(1)
    const jobData = jobs[0]!.data as { subscription_id: string; payload: unknown }
    expect(jobData.subscription_id).toBe(subId)
    expect((jobData.payload as { type: string }).type).toBe('booking.confirmed_online')

    // Cleanup
    await sql`DELETE FROM push_subscriptions WHERE id = ${subId}`
    await sql`DELETE FROM pgboss.job WHERE name = 'push-send'`
  })
})
