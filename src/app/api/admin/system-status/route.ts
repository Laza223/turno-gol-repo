import { NextResponse } from 'next/server'
import { resolveSystemAdmin } from '@/modules/auth/system-admin.guards'
import { withAuth } from '@/server/middleware/with-auth'
import { getSql } from '@/shared/db/client'
import { captureException } from '@/lib/sentry'
import { runCredentialProbes, type ProbeResult } from '@/shared/observability/credential-probes'
import { getQueueDepths } from '@/shared/jobs/queue-stats'
import { forbidden } from '@/shared/api-error'
import { guard } from '@/shared/rate-limit/route-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type QueueDepth = { queue: string; depth: number | null }

export type SystemStatus = {
  /** Sondas de credenciales; `null` salvo que se pida `?probes=1`. */
  credentials?: ProbeResult[] | null
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

/** Profundidad por cola; si la lectura falla, cada entrada degrada a depth null (fail-open). */
async function checkQueues(): Promise<SystemStatus['pgboss']> {
  const entries = await getQueueDepths()
  return { queues: entries.map(({ queue, depth }) => ({ queue, depth })) }
}

/**
 * Último health-ping completado, leído de las tablas internas de pg-boss.
 * Fail-open: cualquier error (permisos, schema ausente) → null.
 *
 * Una sola consulta: pg-boss 12 no tiene tabla `archive` (lo completado vive 7
 * días en `job`, `deleteAfterSeconds` por cola) y `job` entra por índice por
 * `name` (medido 0,11 ms con 35 mil filas) — ya no existe el Seq Scan del archivo.
 *
 * OJO con el tipo de `last`: acá NO llega un `Date`. `getDb()` envuelve ESTA
 * MISMA instancia de postgres-js con drizzle, y drizzle le MUTA los type
 * parsers, así que un `timestamptz` vuelve como string
 * (`2026-08-26 01:00:38.874173+00`) incluso desde un `sql` crudo. La versión
 * anterior anotaba `Date` y llamaba `.toISOString()`: tiraba `TypeError`, el
 * catch mudo se lo tragaba, y el panel mostró `lastHealthPing: null` con 141
 * latidos vivos en la tabla. Medido contra producción el 2026-08-26 — el mismo
 * query con una instancia SIN drizzle devuelve `Date`, y con drizzle `string`.
 */
async function lastHealthPing(): Promise<string | null> {
  try {
    const sql = getSql()
    const rows = await sql<{ last: string | null }[]>`
      SELECT max(completed_on) AS last FROM pgboss_v12.job
      WHERE name = 'health-ping' AND state = 'completed'
    `
    return rows[0]?.last ? new Date(rows[0].last).toISOString() : null
  } catch (err) {
    // Un catch MUDO es como se escondió el bug de arriba durante todo el
    // tiempo que existió. El error viaja a Sentry aunque la respuesta siga
    // degradando a null: este endpoint nunca debe tirar 500.
    captureException(err)
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

  // `?probes=1` corre las sondas de credenciales CONTRA LAS VARIABLES REALES:
  // las que Vercel tiene cargadas en este runtime, no las de un `.env` local que
  // puede estar viejo. Es la única forma de auditar lo que de verdad usa la app,
  // porque los valores de Vercel no se pueden leer desde afuera.
  //
  // Va detrás de un parámetro y no siempre porque son ~7 llamadas de red a
  // terceros (MercadoPago, Resend, R2, Supabase, Upstash): en cada carga del
  // panel serían latencia y consumo de rate-limit ajeno para nada.
  //
  // No filtra secretos: `ProbeResult.detail` trae identificadores de cuenta o
  // recurso, nunca el valor. Igual queda detrás del guard de superadmin, que ya
  // protege todo este endpoint.
  const runProbes = new URL(_req.url).searchParams.get('probes') === '1'
  const credentials = runProbes ? await runCredentialProbes() : null

  const payload: SystemStatus = {
    db,
    pgboss,
    lastHealthPing: ping,
    credentials,
    timestamp: new Date().toISOString(),
  }
  return NextResponse.json({ data: payload })
})
