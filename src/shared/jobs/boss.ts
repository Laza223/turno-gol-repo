import PgBoss from 'pg-boss'
import { logger } from '@/shared/lib/logger'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

let _boss: PgBoss | null = null

// Dev-only: persist pg-boss across Next.js module reloads (HMR / lazy route
// compilation). Without this, recompiles leak a new pg-boss instance — each
// with its own connection pool — exhausting Postgres slots under E2E load.
// Production evaluates modules once, so the global is never written.
const globalForBoss = globalThis as unknown as { __turnogolBoss?: PgBoss }

/**
 * Returns the singleton pg-boss instance, starting it on first call.
 *
 * Schema isolation: pg-boss tables live under the `pgboss` schema (default),
 * keeping them out of the application schema. Migrations don't manage this
 * schema — pg-boss creates/migrates it on `start()`.
 */
export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss
  if (globalForBoss.__turnogolBoss) {
    _boss = globalForBoss.__turnogolBoss
    return _boss
  }
  const url = process.env.DATABASE_URL ?? DEFAULT_URL
  const boss = new PgBoss({
    connectionString: url,
    schema: 'pgboss',
    // Pool interno de pg-boss (node-pg `Pool` bajo pg-boss/src/db.js). Sin
    // `max`, node-pg usa su propio default (10). Prod comparte
    // max_connections=60 entre turnogol_app / turnogol_worker / Supabase
    // pooler — acotamos explícito para que este pool nunca compita por más
    // de lo presupuestado (D5, auditoría 2026-07-23).
    max: 5,
    // Maintenance EXPLÍCITA (D5): la auditoría de prod encontró el poller de
    // pg-boss (`WITH nextJob as (SELECT id FROM pgboss.job ...)`) como la TOP
    // query absoluta de la DB con la app sin tráfico. Los valores de abajo
    // COINCIDEN con los defaults reales de pg-boss v9.0.3 — verificados
    // leyendo node_modules/pg-boss/src/attorney.js — y se dejan explícitos a
    // propósito: la elección queda auditada en vez de heredada en silencio.
    archiveCompletedAfterSeconds: 43200, // 12h — ARCHIVE_DEFAULT en attorney.js
    deleteAfterDays: 7, // default real: applyDeleteConfig() → '7 days'
    maintenanceIntervalSeconds: 120, // default real: applyMaintenanceConfig() → 120
  })
  boss.on('error', (err) => {
    logger.error('pg-boss error', {
      module: 'pg-boss',
      error: err instanceof Error ? err.message : String(err),
    })
  })
  await boss.start()
  _boss = boss
  if (process.env.NODE_ENV !== 'production') {
    globalForBoss.__turnogolBoss = boss
  }
  return boss
}

export async function stopBoss(): Promise<void> {
  if (!_boss) return
  await _boss.stop({ graceful: true, timeout: 5000 })
  _boss = null
  globalForBoss.__turnogolBoss = undefined
}
