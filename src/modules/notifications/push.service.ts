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
import { logger } from '@/shared/lib/logger'

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
  const boss = await getBoss()
  for (const sub of subs) {
    const data: PushSendJobData = { subscription_id: sub.id, payload }
    await boss.send(QUEUE_PUSH_SEND, data, PUSH_SEND_SEND_OPTIONS)
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
