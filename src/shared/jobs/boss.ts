import PgBoss from 'pg-boss'
import { logger } from '@/shared/lib/logger'
import { pgConnectionConfig } from '@/shared/db/ssl'
import { describeBossError } from './boss-error'

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
    // El DSN va SIN `sslmode` y el TLS se decide en código
    // (`pgConnectionConfig`). No es cosmética: pg-boss corre sobre `pg`
    // (node-postgres), y ahí el DSN le GANA a la opción explícita
    // —`Object.assign({}, config, parse(config.connectionString))`—, así que un
    // DSN sin `sslmode` dejaba esta conexión en TEXTO PLANO contra la base de
    // producción, y uno con `sslmode=require` tiraba abajo el proceso contra el
    // certificado del pooler. Medido con pg@8.22.0; la tabla está en
    // `src/shared/db/ssl.ts`.
    ...pgConnectionConfig(url),
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
    // `describeBossError` y no `err.message`: pg-boss emite un OBJETO PLANO, no
    // un Error, y el `String(err)` que había acá escribía `[object Object]` —
    // tirando el message, el stack, y sobre todo QUÉ COLA se rompió.
    logger.error('pg-boss error', { module: 'pg-boss', ...describeBossError(err) })
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
