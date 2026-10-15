import PgBoss from 'pg-boss'
import { logger } from '@/shared/lib/logger'
import { pgConnectionConfig } from '@/shared/db/ssl'
import { withTimeout } from '@/shared/utils/async'
import { describeBossError } from './boss-error'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

// Topes del PRODUCTOR (el worker no tiene, como hoy). Un `start()` que se cuelga —un proxy que
// se traga la conexión, la espera del advisory lock del contractor— dejaba el memo pegado: todo
// `getBoss()` de esa instancia de Vercel colgaba hasta el timeout de la función.
const CONNECT_TIMEOUT_MS = 10_000
const START_TIMEOUT_MS = 15_000

// `producer` (default): encola y lee, sin supervisor ni cron — el rol de todo el
// proceso web. `worker`: además supervisor + cron; solo lo pide `run-workers.ts`.
type BossRole = 'producer' | 'worker'

// Se memoiza la PROMESA de arranque, no la instancia: N llamadas durante un
// `start()` lento abrían N instancias (pool de 5 c/u) sobre max_connections=60.
type BossState = { role: BossRole; ready: Promise<PgBoss> }
let _state: BossState | null = null

// Dev-only: persist pg-boss across Next.js module reloads (HMR / lazy route
// compilation). Without this, recompiles leak a new pg-boss instance — each
// with its own connection pool — exhausting Postgres slots under E2E load.
// Production evaluates modules once, so the global is never written.
const globalForBoss = globalThis as unknown as { __turnogolBossState?: BossState }

/**
 * Returns the singleton pg-boss instance, starting it on first call.
 *
 * Schema isolation: pg-boss tables live under the `pgboss` schema (default),
 * keeping them out of the application schema. Migrations don't manage this
 * schema — pg-boss creates/migrates it on `start()`.
 */
export async function getBoss(role: BossRole = 'producer'): Promise<PgBoss> {
  // El global de dev se lee SIN copiarlo a `_state`: así un arranque fallido que lo limpia
  // desde otra recarga del módulo no deja acá una promesa rechazada cacheada para siempre.
  const current = _state ?? globalForBoss.__turnogolBossState
  if (current) {
    // El productor se conforma con cualquier instancia (el proceso worker también llama
    // getBoss(): dispatchEmail, health-ping…). Un worker sobre un productor quedaría sin cron.
    if (role === 'worker' && current.role !== 'worker') {
      throw new Error(
        "getBoss('worker'): a 'producer' instance already exists or is starting (startup-order bug)",
      )
    }
    return current.ready
  }
  const url = process.env.DATABASE_URL ?? DEFAULT_URL
  const producer = role === 'producer'
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
    // El productor no supervisa ni agenda (index.js:108-114 de pg-boss 9.0.3): sus timers
    // y pollers colgaron `/super-admin` (2026-09-20). Lo hace el worker; `start()` migra igual.
    noSupervisor: producer,
    noScheduling: producer,
    // pg-boss no lo tipa pero se lo pasa al `pg.Pool` (db.js:14): sin esto, una conexión que un
    // proxy se traga espera para siempre.
    ...(producer ? { connectionTimeoutMillis: CONNECT_TIMEOUT_MS } : {}),
  })
  boss.on('error', (err) => {
    // `describeBossError` y no `err.message`: pg-boss emite un OBJETO PLANO, no
    // un Error, y el `String(err)` que había acá escribía `[object Object]` —
    // tirando el message, el stack, y sobre todo QUÉ COLA se rompió.
    logger.error('pg-boss error', { module: 'pg-boss', ...describeBossError(err) })
  })
  const started = producer
    ? withTimeout(boss.start(), START_TIMEOUT_MS, `pg-boss start() exceeded ${START_TIMEOUT_MS}ms`)
    : boss.start()
  const ready = started.then(
    () => boss,
    (err: unknown) => {
      // Un arranque fallido o vencido no queda memoizado: se suelta el memo ANTES de cerrar y
      // sin esperar (un `pool.end()` colgado no traba el reintento). Sin `destroy`, `stop()`
      // no cierra el pool en pg-boss 9.0.3.
      _state = null
      globalForBoss.__turnogolBossState = undefined
      void boss.stop({ graceful: false, destroy: true }).catch(() => {})
      throw err
    },
  )
  _state = { role, ready }
  if (process.env.NODE_ENV !== 'production') {
    globalForBoss.__turnogolBossState = _state
  }
  return ready
}

export async function stopBoss(): Promise<void> {
  const current = _state ?? globalForBoss.__turnogolBossState
  const boss = await current?.ready.catch(() => null)
  if (!boss) return
  await boss.stop({ graceful: true, timeout: 5000 })
  _state = null
  globalForBoss.__turnogolBossState = undefined
}
