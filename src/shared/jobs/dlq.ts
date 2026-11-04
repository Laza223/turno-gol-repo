import type { PgBoss } from 'pg-boss'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/shared/lib/logger'
import { QUEUE_DEAD_LETTER, QUEUE_DEFINITIONS } from './definitions'

/**
 * Canonical list of active pg-boss queue names — todas las de `QUEUE_DEFINITIONS`
 * menos la propia DLQ (`dead-letter`, que casi siempre está vacía: la consume
 * `attachFailureHandlers` al instante, así que no es una profundidad que mirar).
 *
 * Used for the queue-depth admin endpoint y el dashboard.
 */
export const ALL_QUEUES: readonly string[] = QUEUE_DEFINITIONS.map((q) => q.name).filter(
  (name) => name !== QUEUE_DEAD_LETTER,
)

/** Extract a human-readable message from the (loosely-typed) `sourceOutput` field. */
function extractMessage(output: unknown): string {
  if (output == null) return 'unknown error'
  if (typeof output === 'string') return output
  if (typeof output === 'object') {
    const message = (output as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
    try {
      return JSON.stringify(output)
    } catch {
      return 'unserializable error'
    }
  }
  return String(output)
}

/**
 * Suscribe el consumidor de la cola `dead-letter`. Cuando un job de una cola con
 * `deadLetter` (hoy solo `whatsapp-turn`, ver `QUEUE_DEFINITIONS`) agota sus
 * reintentos y falla, pg-boss 12 lo copia a la DLQ con `sourceName`, `sourceId` y
 * `sourceOutput` (el error); lo exponemos como excepción de Sentry + `logger.error`
 * estructurado.
 *
 * Wire this in the long-lived worker process (last line of
 * `registerAllWorkers`), NOT in `getBoss()` — es un poller de larga vida, incorrecto
 * para el proceso web de Next.js.
 */
export async function attachFailureHandlers(boss: PgBoss): Promise<void> {
  try {
    await boss.work(QUEUE_DEAD_LETTER, { includeMetadata: true }, async ([job]) => {
      if (!job) return
      const queue = job.sourceName ?? 'unknown'
      const jobId = String(job.sourceId ?? job.id ?? 'unknown')
      const message = extractMessage(job.sourceOutput)
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
      queue: QUEUE_DEAD_LETTER,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
