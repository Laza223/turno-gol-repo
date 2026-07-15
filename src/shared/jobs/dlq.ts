import type PgBoss from 'pg-boss'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/shared/lib/logger'

/**
 * Canonical list of active pg-boss queue names — every queue that a worker
 * registers via `boss.work(...)` in `registerAllWorkers`. Kept in sync with
 * `src/shared/jobs/workers/index.ts` (13 worker registrations, 14 work queues:
 * `expire-pending-booking` also registers a `-sweep` safety-net queue).
 *
 * Used both for DLQ failure subscriptions and the queue-depth admin endpoint.
 */
export const ALL_QUEUES: readonly string[] = [
  'process-mp-webhook',
  'generate-abonado-slots',
  'send-email',
  'expire-trials',
  'auto-complete-bookings',
  'dunning-retry',
  'data-retention-cleanup',
  'expire-pending-booking',
  'expire-pending-booking-sweep',
  'refresh-mp-tokens',
  'reconcile-pending-payments',
  'retry-pending-refunds',
  'push-send',
  'health-ping',
] as const

/**
 * pg-boss v9 completion record (`job.data` delivered to an `onComplete`
 * handler). Built by pg-boss' `buildJsonCompletionObject`:
 *   { request:{id,name,data}, response, state, retryCount, failed, ... }
 * `failed` is `false` only when `state === 'completed'`; `response` holds the
 * serialized thrown error for a failed job (shape `{message,stack,name}`, a
 * string, or null/undefined).
 */
type CompletionData = {
  state?: string
  failed?: boolean
  response?: unknown
}

type CompletionJob = {
  id?: string | number
  data?: CompletionData
}

/** A completion is a failure when state is 'failed' or the `failed` flag is set. */
function isFailure(data: CompletionData | undefined): boolean {
  if (!data) return false
  return data.state === 'failed' || data.failed === true
}

/** Extract a human-readable message from the (loosely-typed) `response` field. */
function extractMessage(response: unknown): string {
  if (response == null) return 'unknown error'
  if (typeof response === 'string') return response
  if (typeof response === 'object') {
    const message = (response as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
    try {
      return JSON.stringify(response)
    } catch {
      return 'unserializable error'
    }
  }
  return String(response)
}

/**
 * Subscribe a DLQ failure handler on every queue. When a job exhausts its
 * retries and lands in the `failed` state, pg-boss fires the queue's
 * `onComplete` handler with a failure record; we surface that as a Sentry
 * exception + structured `logger.error`.
 *
 * Wire this in the long-lived worker process (last line of
 * `registerAllWorkers`), NOT in `getBoss()` — completion handlers are
 * long-running pollers, wrong for the short-lived Next.js web process.
 */
export async function attachFailureHandlers(boss: PgBoss): Promise<void> {
  await Promise.all(
    ALL_QUEUES.map(async (queue) => {
      try {
        await boss.onComplete(queue, (job: CompletionJob) => {
          const data = job?.data
          if (!isFailure(data)) return
          const jobId = String(job?.id ?? 'unknown')
          const message = extractMessage(data?.response)
          Sentry.captureException(new Error(`Job ${queue} failed: ${message}`), {
            tags: { queue, job_id: jobId },
          })
          logger.error('job.failed', {
            module: 'dlq',
            queue,
            job_id: jobId,
            error: message,
          })
        })
      } catch (err) {
        logger.warn('dlq.subscribe_failed', {
          module: 'dlq',
          queue,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }),
  )
}
