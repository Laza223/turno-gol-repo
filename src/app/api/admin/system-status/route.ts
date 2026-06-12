import { NextResponse } from 'next/server'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffRole } from '@/modules/staff/staff.service'
import { getSql } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import { ALL_QUEUES } from '@/shared/jobs/dlq'
import { forbidden, unauthorized } from '@/shared/api-error'
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
 * Solo rol 'admin' verificado contra DB (getStaffRole): el claim `role` del JWT
 * está hardcodeado en 'admin' para todo el staff, así que NO sirve como barrera.
 * Una dependencia caída degrada su campo (down / null) — nunca un 500.
 */
export async function GET(): Promise<NextResponse> {
  const user = await extractAuthUser()
  if (!user) {
    return unauthorized('Autenticación requerida.', { code: 'AUTH_REQUIRED' })
  }
  if (user.type !== 'staff' || !user.staffUserId || !user.tenantId) {
    return forbidden('Se requiere una cuenta de staff.', { code: 'STAFF_REQUIRED' })
  }

  const throttled = await guard('adminCrud', user.tenantId)
  if (throttled) return throttled

  const role = await getStaffRole(user.tenantId, user.staffUserId)
  if (role !== 'admin') {
    return forbidden('Solo administradores pueden ver el estado del sistema.', {
      code: 'ROLE_REQUIRED',
      details: { required: 'admin' },
    })
  }

  const [db, pgboss, ping] = await Promise.all([checkDb(), checkQueues(), lastHealthPing()])
  const payload: SystemStatus = {
    db,
    pgboss,
    lastHealthPing: ping,
    timestamp: new Date().toISOString(),
  }
  return NextResponse.json({ data: payload })
}
