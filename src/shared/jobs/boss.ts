import { PgBoss } from 'pg-boss'
import { logger } from '@/shared/lib/logger'
import { pgConnectionConfig } from '@/shared/db/ssl'
import { withTimeout } from '@/shared/utils/async'
import { describeBossError } from './boss-error'
import { ensureQueues } from './ensure-queues'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * Schema de pg-boss 12. La 12 NO migra un schema de la 9 (`start()` tira "Cannot migrate
 * pg-boss schema from version 20"), así que vive en uno nuevo que crea la migración 104; lo que
 * quedó pendiente en `pgboss` lo mueve `legacy-v9-drain.ts`.
 */
export const PGBOSS_SCHEMA = 'pgboss_v12'

// Topes del PRODUCTOR (el worker no tiene, como hoy). Un `start()` que se cuelga —un proxy que
// se traga la conexión, la espera del advisory lock del contractor— dejaba el memo pegado: todo
// `getBoss()` de esa instancia de Vercel colgaba hasta el timeout de la función. El tope cubre
// también `ensureQueues`.
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
 * Schema isolation: pg-boss tables live under the `pgboss_v12` schema, keeping them
 * out of the application schema. El schema VACÍO lo crea la migración 104
 * (`createSchema: false`: `turnogol_app` no puede crear schemas); las tablas las
 * instala y migra pg-boss en `start()`. Después de `start()`, `ensureQueues` deja
 * creadas las colas del registro antes de resolver la promesa.
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
    schema: PGBOSS_SCHEMA,
    createSchema: false,
    // Pool interno de pg-boss (node-pg `Pool`). Sin `max`, node-pg usa su propio
    // default (10). Prod comparte max_connections=60 entre turnogol_app /
    // turnogol_worker / Supabase pooler — acotamos explícito para que este pool
    // nunca compita por más de lo presupuestado (D5, auditoría 2026-07-23).
    max: 5,
    // El worker corre con los defaults de la 12 (supervisor, cron, mantenimiento: lo de
    // `archiveCompletedAfterSeconds`, `deleteAfterDays` y `maintenanceIntervalSeconds` de la 9
    // ya no existe como tal — la 12 no tiene tabla `archive` y borra lo completado a los 7 días
    // por cola, `deleteAfterSeconds`).
    //
    // El PRODUCTOR no supervisa, no agenda y no se registra: sus timers y pollers colgaron
    // `/super-admin` (2026-09-20). Medido contra Postgres 17 + PgBouncer en modo transacción:
    // 6 sentencias al arrancar y CERO en 70 s de reposo. Sin `registerInstance: false` cada
    // instancia escribe un latido cada 30 s; sin los intervalos altos consulta colas y BAM cada
    // 60 s. `migrate` queda en true a propósito: con `migrate: false`, `check()` falla si la
    // versión de la base difiere en CUALQUIER sentido, y la web no podría encolar cada vez que
    // un minor de la 12 migre el schema antes o después que ella.
    ...(producer
      ? {
          supervise: false,
          schedule: false,
          registerInstance: false,
          queueCacheIntervalSeconds: 3600,
          bamIntervalSeconds: 3600,
          // Sin esto, una conexión que un proxy se traga espera para siempre.
          connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
        }
      : {}),
  })
  boss.on('error', (err) => {
    // `describeBossError` y no `err.message`: pg-boss emite un OBJETO PLANO, no
    // un Error, y el `String(err)` que había acá escribía `[object Object]` —
    // tirando el message, el stack, y sobre todo QUÉ COLA se rompió.
    logger.error('pg-boss error', { module: 'pg-boss', ...describeBossError(err) })
  })
  boss.on('warning', (warning) => {
    logger.warn('pg-boss warning', { module: 'pg-boss', warning })
  })
  const start = async () => {
    await boss.start()
    await ensureQueues(boss, role)
  }
  const started = producer
    ? withTimeout(start(), START_TIMEOUT_MS, `pg-boss start() exceeded ${START_TIMEOUT_MS}ms`)
    : start()
  const ready = started.then(
    () => boss,
    (err: unknown) => {
      // Un arranque fallido o vencido no queda memoizado: se suelta el memo ANTES de cerrar y
      // sin esperar (un `pool.end()` colgado no traba el reintento). `close` es true por defecto.
      _state = null
      globalForBoss.__turnogolBossState = undefined
      void boss.stop({ graceful: false }).catch(() => {})
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
