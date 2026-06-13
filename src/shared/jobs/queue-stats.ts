import { getBoss } from '@/shared/jobs/boss'
import { ALL_QUEUES } from '@/shared/jobs/dlq'

/**
 * Snapshot entry for one pg-boss queue. `depth` is the pending size reported
 * by `boss.getQueueSize(queue)`; a per-queue failure degrades that entry to
 * `depth: null` + `error: 'unavailable'` instead of failing the whole snapshot.
 */
export type QueueDepthEntry = {
  queue: string
  depth: number | null
  error?: 'unavailable'
}

/**
 * Queue-depth snapshot across every active pg-boss queue (B10 T7).
 *
 * Shared by the `/api/admin/jobs` endpoint and the super-admin dashboard
 * (`src/modules/super-admin/dashboard.service.ts`). Throws only if pg-boss
 * itself cannot start (`getBoss()`); individual queue failures degrade
 * per-entry, matching the original endpoint behavior.
 */
export async function getQueueDepths(): Promise<QueueDepthEntry[]> {
  const boss = await getBoss()
  return Promise.all(
    ALL_QUEUES.map(async (queue): Promise<QueueDepthEntry> => {
      try {
        return { queue, depth: await boss.getQueueSize(queue) }
      } catch {
        return { queue, depth: null, error: 'unavailable' }
      }
    }),
  )
}
