import type PgBoss from 'pg-boss'
import type { Job } from 'pg-boss'
import { getSql } from '@/shared/db/client'
import { sendPushNotification } from '@/lib/web-push'
import { logger } from '@/shared/lib/logger'
import { track } from '@/shared/observability'
import { QUEUE_PUSH_SEND, type PushSendJobData } from '../definitions'

export async function handlePushSendJob(job: Job<PushSendJobData>): Promise<void> {
  const { subscription_id, payload } = job.data
  const sql = getSql()
  const rows = await sql<{
    id: string
    endpoint: string
    p256dh_key: string
    auth_key: string
  }[]>`
    SELECT id, endpoint, p256dh_key, auth_key
    FROM push_subscriptions
    WHERE id = ${subscription_id}
    LIMIT 1
  `
  const sub = rows[0]
  if (!sub) {
    logger.warn('push.worker: subscription gone before send', {
      module: 'push.worker',
      subscriptionId: subscription_id,
    })
    return
  }
  const result = await sendPushNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
    payload,
  )
  if (result.success) {
    await sql`UPDATE push_subscriptions SET last_used_at = now() WHERE id = ${sub.id}`
    return
  }
  if (result.gone) {
    await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`
    track.notification('notification.push.failed', {
      statusCode: 410,
      reason: 'subscription_deleted',
      endpoint: sub.endpoint,
    })
    return
  }
  throw new Error(`push send failed: statusCode=${result.statusCode} ${result.error}`)
}

export async function registerPushSendWorker(boss: PgBoss): Promise<void> {
  await boss.work<PushSendJobData>(QUEUE_PUSH_SEND, async (job) => {
    const j = Array.isArray(job) ? job[0] : job
    if (!j) return
    await handlePushSendJob(j)
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_PUSH_SEND })
}
