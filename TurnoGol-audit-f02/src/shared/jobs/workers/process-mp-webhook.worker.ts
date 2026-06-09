import type PgBoss from 'pg-boss'
import { QUEUE_PROCESS_MP_WEBHOOK } from '../queue-names'
import {
  handleMpWebhookJob,
  type MpWebhookJob,
} from '@/modules/payments/mp-webhook.handler'
import { track } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'

/**
 * Register the `process-mp-webhook` consumer on a running pg-boss instance.
 * Errors thrown by the handler propagate to pg-boss → retry per
 * `MP_WEBHOOK_SEND_OPTIONS` (set at enqueue time in the route).
 */
export async function registerMpWebhookWorker(boss: PgBoss): Promise<void> {
  await boss.work<MpWebhookJob>(QUEUE_PROCESS_MP_WEBHOOK, async (job) => {
    const data = (Array.isArray(job) ? job[0]?.data : job.data) as MpWebhookJob
    try {
      await handleMpWebhookJob(data)
    } catch (err) {
      track.webhook('mp.webhook.failed', {
        mpEventId: data?.mpEventId,
        tenantId: data?.tenantId,
        eventType: data?.eventType,
      })
      throw err
    }
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_PROCESS_MP_WEBHOOK })
}
