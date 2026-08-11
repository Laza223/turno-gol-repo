/**
 * Integration test: F3 (hallazgo D4 🔴) — idempotencia del worker push-send.
 *
 * Un job de push re-entregado (retry de pg-boss, retryLimit=3, tras un
 * crash/error POST-envío) con la MISMA dedupeKey no debe volver a llamar
 * sendPushNotification. El claim (INSERT ... ON CONFLICT DO NOTHING
 * RETURNING en push_send_log, migr. 059) colapsa la 2da entrega a un no-op.
 *
 * Requires a running Supabase instance (`supabase start`) with DATABASE_URL set.
 * Falla si la DB no está disponible: sin base no hay señal que dar.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { cleanupAll, createTestStaffUser, createTestTenant, ensureRoles } from '../helpers/tenant'

beforeAll(async () => {
  const sql = getSql()
  await sql`SELECT 1`
  await ensureRoles(sql)
  await cleanupAll(sql)
  await sql`DELETE FROM push_subscriptions`
  await sql`DELETE FROM push_send_log`
}, 30_000)

afterAll(async () => {
  try {
    const sql = getSql()
    await sql`DELETE FROM push_subscriptions`
    await sql`DELETE FROM push_send_log`
    await closeSql()
  } catch {
    // best-effort cleanup
  }
})

describe('push.worker idempotencia por dedupeKey (F3, hallazgo D4)', () => {
  // El mock de sendPushNotification es compartido por los 2 `it` de este
  // archivo — sin este clear, el conteo de llamadas del 2do test arrastra
  // las del 1ro (ambos comparten el mismo spy vi.fn() del vi.mock de arriba).
  beforeEach(() => {
    vi.mocked(sendPushNotification).mockClear()
  })

  it('2 entregas del mismo job (dedupeKey igual) → 1 solo send real, 1 fila en push_send_log', async () => {
    vi.mocked(sendPushNotification).mockResolvedValue({
      success: true,
      statusCode: 201,
    })

    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)

    // Seed 1 push_subscriptions row (misma mecánica que push-worker-410-cleanup.test.ts).
    const subRows = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES (
        ${tenant.id},
        ${staff.id},
        ${'https://push.example.com/idempotency-test'},
        ${'p256dh-idempotency-test'},
        ${'auth-idempotency-test'}
      )
      RETURNING id
    `
    const subId = subRows[0]!.id
    const dedupeKey = `push:idempotency-test:${subId}`

    const jobData: PushSendJobData = {
      subscription_id: subId,
      payload: { type: 'booking.confirmed_online', bookingId: 'b-idempotency-test' },
      dedupeKey,
    }

    // 1ra entrega: el claim está libre, envía de verdad.
    await handlePushSendJob({
      id: 'fake-job-id-idempotency-1',
      name: 'push-send',
      data: jobData,
    } as Job<PushSendJobData>)

    // 2da entrega: simula el retry de pg-boss (mismo job.data, MISMA
    // dedupeKey) — el claim ya está tomado, debe ser un no-op.
    await handlePushSendJob({
      id: 'fake-job-id-idempotency-2',
      name: 'push-send',
      data: jobData,
    } as Job<PushSendJobData>)

    // Solo 1 send real pese a las 2 entregas.
    expect(sendPushNotification).toHaveBeenCalledTimes(1)

    // Solo 1 fila de claim en push_send_log (el 2do INSERT chocó con ON CONFLICT).
    const logRows = await sql<{ dedupe_key: string }[]>`
      SELECT dedupe_key FROM push_send_log WHERE dedupe_key = ${dedupeKey}
    `
    expect(logRows).toHaveLength(1)
  })

  it('2 jobs con dedupeKey DISTINTA (misma subscription) → 2 sends reales', async () => {
    // Control negativo: el guard es por key, no por subscription_id — dos
    // notificaciones legítimas y distintas (ej. 2 bookings confirmados
    // distintos) para el mismo admin SÍ deben enviarse ambas.
    vi.mocked(sendPushNotification).mockResolvedValue({
      success: true,
      statusCode: 201,
    })

    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)

    const subRows = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (tenant_id, staff_user_id, endpoint, p256dh_key, auth_key)
      VALUES (
        ${tenant.id},
        ${staff.id},
        ${'https://push.example.com/idempotency-distinct-test'},
        ${'p256dh-idempotency-distinct-test'},
        ${'auth-idempotency-distinct-test'}
      )
      RETURNING id
    `
    const subId = subRows[0]!.id

    await handlePushSendJob({
      id: 'fake-job-id-distinct-1',
      name: 'push-send',
      data: {
        subscription_id: subId,
        payload: { type: 'booking.confirmed_online', bookingId: 'b-distinct-1' },
        dedupeKey: `push:booking-confirmed:b-distinct-1:${subId}`,
      },
    } as Job<PushSendJobData>)

    await handlePushSendJob({
      id: 'fake-job-id-distinct-2',
      name: 'push-send',
      data: {
        subscription_id: subId,
        payload: { type: 'booking.confirmed_online', bookingId: 'b-distinct-2' },
        dedupeKey: `push:booking-confirmed:b-distinct-2:${subId}`,
      },
    } as Job<PushSendJobData>)

    expect(sendPushNotification).toHaveBeenCalledTimes(2)
  })
})
