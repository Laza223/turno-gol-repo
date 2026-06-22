/**
 * Push notification dispatch service (admin-facing).
 *
 * - notifyAdminPush(tenantId, payload): loads all push_subscriptions for the
 *   tenant via service role (no RLS, no tenant context required), enqueues 1
 *   pg-boss QUEUE_PUSH_SEND job per subscription.
 * - Skips silently if no subscriptions found (admin has not opted in).
 * - MUST be called AFTER the parent transaction commits (same pattern as
 *   dispatchEmail). pg-boss send is at-least-once; the worker is idempotent.
 */

import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import {
  PUSH_SEND_SEND_OPTIONS,
  QUEUE_PUSH_SEND,
  type PushSendJobData,
} from '@/shared/jobs/definitions'
import { pushSendOptions } from './push-quiet-hours'
import { logger } from '@/shared/lib/logger'

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

export type AdminPushPayload = PushSendJobData['payload']

export async function notifyAdminPush(
  tenantId: string,
  payload: AdminPushPayload,
): Promise<{ enqueued: number }> {
  const sql = getSql()
  const subs = await sql<{ id: string }[]>`
    SELECT id FROM push_subscriptions WHERE tenant_id = ${tenantId}
  `
  if (subs.length === 0) {
    return { enqueued: 0 }
  }

  // Tarea #7: respetar el horario silencioso del complejo. En madrugada el push
  // se agenda para las 08:00 locales (startAfter) en vez de sonar al instante.
  const tzRows = await sql<{ timezone: string | null }[]>`
    SELECT timezone FROM tenants WHERE id = ${tenantId} LIMIT 1
  `
  const timeZone = tzRows[0]?.timezone ?? DEFAULT_TIMEZONE
  const options = pushSendOptions(new Date(), timeZone)

  const boss = await getBoss()
  for (const sub of subs) {
    const data: PushSendJobData = { subscription_id: sub.id, payload }
    await boss.send(QUEUE_PUSH_SEND, data, options)
  }
  logger.info('enqueued admin push notifications', {
    module: 'push.service',
    tenantId,
    count: subs.length,
    payloadType: payload.type,
  })
  return { enqueued: subs.length }
}

/**
 * Notify all subscribed admins of a given staff_user_id (for /api/admin/push/test).
 */
export async function notifyStaffPush(
  tenantId: string,
  staffUserId: string,
  payload: AdminPushPayload,
): Promise<{ enqueued: number }> {
  const sql = getSql()
  const subs = await sql<{ id: string }[]>`
    SELECT id FROM push_subscriptions
    WHERE tenant_id = ${tenantId} AND staff_user_id = ${staffUserId}
  `
  if (subs.length === 0) return { enqueued: 0 }
  const boss = await getBoss()
  for (const sub of subs) {
    const data: PushSendJobData = { subscription_id: sub.id, payload }
    await boss.send(QUEUE_PUSH_SEND, data, PUSH_SEND_SEND_OPTIONS)
  }
  logger.info('enqueued staff push notifications', {
    module: 'push.service',
    tenantId,
    staffUserId,
    count: subs.length,
    payloadType: payload.type,
  })
  return { enqueued: subs.length }
}
