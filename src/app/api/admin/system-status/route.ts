import { NextResponse } from 'next/server'
import { resolveSystemAdmin } from '@/modules/auth/system-admin.guards'
import { withAuth } from '@/server/middleware/with-auth'
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { forbidden } from '@/shared/api-error'
import { guard } from '@/shared/rate-limit/route-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type QueueDepth = { queue: string; depth: number | null }

export type SystemStatus = {
  db: { status: 'ok' | 'down'; latencyMs: number | null }
  pgboss: { queues: QueueDepth[] }
  lastHealthPing: string | null // ISO; null si no se pudo leer
  timestamp: string
}

async function checkDb(): Promise<SystemStatus['db']> {
  const t0 = Date.now()
  try {
    await getSql()`SELECT 1`
    return { status: 'ok', latencyMs: Date.now() - t0 }
  } catch {
    return { status: 'down', latencyMs: null }
  }
}

/** Profundidad por cola; cada fallo degrada esa entrada a depth null (fail-open). */
async function checkQueues(): Promise<SystemStatus['pgboss']> {
  try {
    const boss = await getBoss()
    const queues = await Promise.all(
      ALL_QUEUES.map(async (queue): Promise<QueueDepth> => {
        try {
          return { queue, depth: await boss.getQueueSize(queue) }
        } catch {
          return { queue, depth: null }
        }
      }),
    )
    return { queues }
  } catch {
    // pg-boss caído por completo: degradamos todas las colas, nunca 500.
    return { queues: ALL_QUEUES.map((queue) => ({ queue, depth: null })) }
  }
}

/**
 * Último health-ping completado, leído de las tablas internas de pg-boss
 * (job + archive: el archiver mueve los completados después de un rato).
 * Fail-open: cualquier error (permisos, schema ausente) → null.
 */
async function lastHealthPing(): Promise<string | null> {
  try {
    const sql = getSql()
    const rows = await sql<{ last: Date | null }[]>`
      SELECT max(completedon) AS last FROM (
        SELECT completedon FROM pgboss.job
        WHERE name = 'health-ping' AND state = 'completed'
        UNION ALL
        SELECT completedon FROM pgboss.archive
        WHERE name = 'health-ping' AND state = 'completed'
      ) pings
    `
    return rows[0]?.last ? rows[0].last.toISOString() : null
  } catch {
    return null
  }
}

/**
 * Estado del sistema para el panel de observabilidad del dashboard /metricas.
 * Solo superadministradores de la plataforma (resolveSystemAdmin).
 * Una dependencia caída degrada su campo (down / null) — nunca un 500.
 *
 * B10 — va por `withAuth` y no por un `extractAuthUser` a mano. El bloque que
 * había acá era letra por letra el del wrapper (mismo mensaje, mismo
 * `AUTH_REQUIRED`), pero al ser una función pelada la ruta se quedaba SIN
 * `runRequestObservability`: sus 401/403 volvían con `meta.request_id: null` y
 * sus líneas de log sin requestId — la misma regresión que B5 cerró para los
 * otros tres wrappers (ver `tests/unit/route-wrappers-request-context.test.ts`).
 * Era el único consumidor legítimo de `withAuth`, que por eso parecía muerto.
 */
export const GET = withAuth(async (_req, user): Promise<NextResponse> => {
  const systemAdmin = await resolveSystemAdmin()
  if (!systemAdmin) {
    return forbidden(
      'Solo superadministradores de la plataforma pueden ver el estado del sistema.',
      {
        code: 'SUPER_ADMIN_REQUIRED',
      },
    )
  }

  if (user.type === 'staff' && user.tenantId) {
    const throttled = await guard('adminCrud', user.tenantId)
    if (throttled) return throttled
  }

  const [db, pgboss, ping] = await Promise.all([checkDb(), checkQueues(), lastHealthPing()])
  const payload: SystemStatus = {
    db,
    pgboss,
    lastHealthPing: ping,
    timestamp: new Date().toISOString(),
  }
  return NextResponse.json({ data: payload })
})
