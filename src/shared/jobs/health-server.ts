import { createServer, type Server } from 'node:http'
import type PgBoss from 'pg-boss'
import { assertAppDbReachable, getWorkerSql } from '@/shared/db/client'
import { logger } from '@/shared/lib/logger'

/**
 * Un `GET /health` mínimo dentro del proceso de workers.
 *
 * ─── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Railway solo sabe si el proceso RESPIRA. Eso no distingue "el worker
 * trabaja" de "el worker está vivo y no puede hablar con la base", que es
 * exactamente lo que pasó el 2026-08-25: arrancó bien, latió cada 5 minutos
 * durante horas, y todo `withTenantContext` fallaba.
 *
 * Con un *healthcheck path* configurado, Railway consulta este endpoint en
 * CADA deploy nuevo y solo lo deja pasar si devuelve 200. Si no, marca el
 * deploy como fallido y **el anterior sigue corriendo**. O sea: convierte "se
 * deployó un worker roto y nos enteramos horas después" en "el deploy no
 * entró". Es un candado de deploy, no un monitor continuo — el monitor
 * continuo sigue siendo el dead-man's switch de P-12 sobre `/api/status`.
 *
 * ─── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * No expone el detalle de los errores: el semáforo es público, el motivo va al
 * log y a Sentry. Mismo criterio que `/api/status`.
 *
 * Y nunca tira. Si el puerto está tomado, lo dice en el log y los workers
 * siguen su vida: quedarse sin healthcheck es malo, quedarse sin workers es
 * peor.
 */

const DEFAULT_PORT = 8080

type Check = { name: string; ok: boolean }

async function checkAppPool(): Promise<Check> {
  try {
    // Vía `assertAppDbReachable` y no `getSql()` directo: la regla de lint del
    // repo prohíbe el pool de la app dentro de `src/shared/jobs/**` —bajo RLS un
    // sweep cross-tenant devuelve CERO filas en silencio— y acá no queremos la
    // excepción, queremos el único uso legítimo, que ya vive encapsulado con su
    // motivo escrito en `client.ts`.
    await assertAppDbReachable()
    return { name: 'app-pool', ok: true }
  } catch (err) {
    logger.error('health server: app pool down', {
      module: 'health-server',
      error: err instanceof Error ? err.message : String(err),
    })
    return { name: 'app-pool', ok: false }
  }
}

async function checkWorkerPool(): Promise<Check> {
  try {
    const sql = getWorkerSql()
    const rows = await sql<{ ok: boolean }[]>`
      SELECT (rolbypassrls OR rolsuper) AS ok FROM pg_roles WHERE rolname = current_user
    `
    return { name: 'worker-pool', ok: rows[0]?.ok === true }
  } catch (err) {
    logger.error('health server: worker pool down', {
      module: 'health-server',
      error: err instanceof Error ? err.message : String(err),
    })
    return { name: 'worker-pool', ok: false }
  }
}

async function checkBoss(boss: PgBoss): Promise<Check> {
  try {
    await boss.getQueueSize('send-email')
    return { name: 'pg-boss', ok: true }
  } catch (err) {
    // Mismo criterio que `/api/status`: en producción el rol NO puede
    // introspeccionar el schema de pg-boss, y eso es a propósito. Que la
    // consulta llegue hasta el "permission denied" ya prueba que el pool vive.
    const msg = String((err as Error).message ?? err).toLowerCase()
    if (msg.includes('permission denied') || msg.includes('does not exist')) {
      return { name: 'pg-boss', ok: true }
    }
    logger.error('health server: pg-boss down', {
      module: 'health-server',
      error: err instanceof Error ? err.message : String(err),
    })
    return { name: 'pg-boss', ok: false }
  }
}

export async function runHealthChecks(boss: PgBoss): Promise<Check[]> {
  return Promise.all([checkAppPool(), checkWorkerPool(), checkBoss(boss)])
}

/** Puerto que sondea Railway. Un `PORT` basura no puede dejarnos sin servidor. */
export function healthPort(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.PORT)
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : DEFAULT_PORT
}

/** Levanta el servidor. Devuelve `null` si no pudo — nunca tira. */
export function startHealthServer(boss: PgBoss): Server | null {
  const port = healthPort()
  try {
    const server = createServer((req, res) => {
      if (req.method !== 'GET' || !req.url?.startsWith('/health')) {
        res.writeHead(404).end()
        return
      }
      void runHealthChecks(boss).then(
        (checks) => {
          const ok = checks.every((c) => c.ok)
          res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ status: ok ? 'ok' : 'down', checks }))
        },
        () => {
          res.writeHead(503, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ status: 'down' }))
        },
      )
    })
    server.on('error', (err) => {
      logger.error('health server error', {
        module: 'health-server',
        error: err instanceof Error ? err.message : String(err),
      })
    })
    server.listen(port, () => {
      logger.info('health server listening', { module: 'health-server', port })
    })
    // Que el proceso no siga vivo SOLO por este servidor.
    server.unref()
    return server
  } catch (err) {
    logger.error('health server failed to start', {
      module: 'health-server',
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
