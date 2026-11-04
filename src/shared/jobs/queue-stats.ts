// Excepción legítima a `turnogol/jobs-worker-pool`: las tablas de pg-boss son de
// `turnogol_app` (el rol con el que pg-boss se instala, migración 104) y no son tablas
// de tenant — no hay RLS que pueda esconder filas en silencio.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getSql } from '@/shared/db/client'
import { ALL_QUEUES } from '@/shared/jobs/dlq'

/**
 * Snapshot entry for one pg-boss queue. `depth` is the pending size (jobs en estado
 * `created` o `retry`, o sea esperando); si la lectura falla se degrada a
 * `depth: null` + `error: 'unavailable'` en vez de romper el snapshot.
 */
export type QueueDepthEntry = {
  queue: string
  depth: number | null
  error?: 'unavailable'
}

/**
 * Queue-depth snapshot across every active pg-boss queue (B10 T7).
 *
 * Shared by the `/api/admin/jobs` endpoint and `/api/admin/system-status`. Una sola query
 * SQL (`state < 'active'`: el enum de pg-boss 12 sigue `created < retry < active < …`) y no
 * N llamadas a pg-boss: la 12 no tiene `getQueueSize`, y `getQueue().queuedCount` lo calcula
 * el monitor del worker (dio 0 con jobs vivos), así que no sirve como conteo en vivo.
 */
export async function getQueueDepths(): Promise<QueueDepthEntry[]> {
  try {
    const rows = await getSql()<{ name: string; depth: number }[]>`
      SELECT name, count(*)::int AS depth
      FROM pgboss_v12.job
      WHERE state < 'active'
      GROUP BY name
    `
    const depthByQueue = new Map(rows.map((r) => [r.name, r.depth]))
    return ALL_QUEUES.map((queue) => ({ queue, depth: depthByQueue.get(queue) ?? 0 }))
  } catch {
    return ALL_QUEUES.map((queue) => ({ queue, depth: null, error: 'unavailable' as const }))
  }
}
