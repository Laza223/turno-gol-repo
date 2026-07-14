import postgres, { type Sql, type TransactionSql } from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql as drizzleSql } from 'drizzle-orm'
import * as schema from './schema'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

type AppRole = 'authenticated' | 'anon' | 'service_role' | 'turnogol_app'

const ALLOWED_ROLES: ReadonlySet<AppRole> = new Set<AppRole>([
  'authenticated',
  'anon',
  'service_role',
  'turnogol_app',
])

export type ContextOpts = {
  tenantId?: string | null
  playerId?: string | null
  systemAdminId?: string | null
  role?: AppRole
  jwtClaims?: Record<string, unknown>
}

let _sql: Sql | null = null

// Dev-only: persist the pool across Next.js module reloads (HMR / lazy route
// compilation). Without this, each recompile re-evaluates this module, resets
// `_sql`, and leaks a fresh pool — exhausting Postgres connection slots under
// E2E load. In production modules evaluate once, so the global is never written
// and behavior is identical to the bare module singleton.
const globalForDb = globalThis as unknown as { __turnogolSql?: Sql }

// Connection-pool size. Default 3 to stay serverless-safe: on Vercel each
// concurrent function instance opens its OWN pool, so a high `max` × many
// instances exhausts Postgres' connection slots. The long-lived worker process
// (`pnpm jobs:start`) and integration tests can raise it via DATABASE_POOL_MAX.
const DEFAULT_POOL_MAX = 3

function resolvePoolMax(): number {
  const raw = process.env.DATABASE_POOL_MAX
  if (!raw) return DEFAULT_POOL_MAX
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_POOL_MAX
}

export function getSql(): Sql {
  if (_sql) return _sql
  if (globalForDb.__turnogolSql) {
    _sql = globalForDb.__turnogolSql
    return _sql
  }
  const url = process.env.DATABASE_URL ?? DEFAULT_URL
  _sql = postgres(url, {
    max: resolvePoolMax(),
    prepare: false,
    onnotice: () => {},
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__turnogolSql = _sql
  }
  return _sql
}

export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 })
    _sql = null
    _db = null
    globalForDb.__turnogolSql = undefined
  }
  if (_workerSql) {
    await _workerSql.end({ timeout: 5 })
    _workerSql = null
    _workerDb = null
    globalForWorkerDb.__turnogolWorkerSql = undefined
  }
}

// ─── Drizzle wrapper ────────────────────────────────────────────────
// Comparte el mismo pool de postgres v3 (getSql) — un solo connection pool.

export type Db = PostgresJsDatabase<typeof schema>
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Deshace la mutación que `drizzle(client)` le hace a la instancia de postgres-js.
 *
 * drizzle-orm 0.45 pisa los serializers de json (OID 114) y jsonb (3802) del
 * cliente con una identidad (`postgres-js/driver.js`: `client.options
 * .serializers["3802"] = transparentParser`). Lo hace porque su `jsonb` de
 * pg-core ya stringify-ea en `toDriver` y, sin la identidad, postgres-js
 * volvería a serializar → doble-encode.
 *
 * Pero acá hay UNA sola instancia de postgres-js compartida entre drizzle
 * (`getDb`) y el SQL crudo (`getSql`), así que esa mutación es global: con los
 * serializers en identidad, cualquier `sql.json(obj)` crudo manda el OBJETO al
 * driver, que espera un string, y tira
 * `ERR_INVALID_ARG_TYPE: The "string" argument must be of type string`.
 *
 * Restaurar JSON.stringify deja los dos caminos consistentes con el invariante
 * que asume todo el código ("pasás el objeto, se serializa una vez"):
 *   - drizzle  → `../jsonb` customType.toDriver devuelve el objeto crudo → acá se
 *                serializa una vez.
 *   - SQL crudo → `sql.json(obj)` → se serializa una vez.
 *
 * Es seguro porque NINGUNA columna del schema usa el `jsonb`/`json` nativo de
 * pg-core (que sí double-encodearía): las 6 tablas con jsonb importan el
 * customType de `../jsonb`. Si algún día se agrega una columna con el jsonb de
 * pg-core, este restore la corrompe — usar siempre `../jsonb`.
 */
function restoreJsonSerializers(client: Sql): void {
  const opts = (client as unknown as { options: { serializers: Record<string, (v: unknown) => unknown> } }).options
  opts.serializers['114'] = (v) => JSON.stringify(v)
  opts.serializers['3802'] = (v) => JSON.stringify(v)
}

let _db: Db | null = null

export function getDb(): Db {
  if (_db) return _db
  const client = getSql()
  _db = drizzle(client, { schema })
  restoreJsonSerializers(client)
  return _db
}

// ─── Worker (service-role) pool ──────────────────────────────────────
// Background jobs run system-wide sweeps across tenants (dunning, expiry,
// retention, reconciliation) — reads/writes that RLS can't scope to a single
// `app.current_tenant_id`. `getSql()`/`getDb()` use DATABASE_URL, which in
// production is a restricted role by design (`bypassRlsCheck` in
// launch-check.ts fails the deploy otherwise) — that pool would silently see
// 0 rows for a cross-tenant scan. `WORKER_DATABASE_URL` points at a role with
// BYPASSRLS reserved for exactly this ("Background jobs usan rol de servicio
// separado", CLAUDE.md). Falls back to DATABASE_URL for local/test, where the
// default role already bypasses RLS. Mutations that touch a SINGLE known
// tenant should still go through `withTenantContext` on the regular pool —
// only cross-tenant reads/writes belong here.
const globalForWorkerDb = globalThis as unknown as { __turnogolWorkerSql?: Sql }

let _workerSql: Sql | null = null

export function getWorkerSql(): Sql {
  if (_workerSql) return _workerSql
  if (globalForWorkerDb.__turnogolWorkerSql) {
    _workerSql = globalForWorkerDb.__turnogolWorkerSql
    return _workerSql
  }
  const url = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_URL
  _workerSql = postgres(url, {
    max: resolvePoolMax(),
    prepare: false,
    onnotice: () => {},
  })
  if (process.env.NODE_ENV !== 'production') {
    globalForWorkerDb.__turnogolWorkerSql = _workerSql
  }
  return _workerSql
}

let _workerDb: Db | null = null

export function getWorkerDb(): Db {
  if (_workerDb) return _workerDb
  const client = getWorkerSql()
  _workerDb = drizzle(client, { schema })
  restoreJsonSerializers(client)
  return _workerDb
}

/**
 * Boot-time visibility assertion (Fable 5 P0): fails fast if the worker pool
 * can't actually see across tenants, instead of every cron silently
 * processing 0 rows forever. Checks the connected role's BYPASSRLS attribute
 * directly rather than probing a specific table, so it doesn't depend on
 * seed data existing.
 */
export async function assertWorkerDbVisibility(): Promise<void> {
  const sql = getWorkerSql()
  const rows = await sql<{ rolname: string; bypass: boolean }[]>`
    SELECT rolname, rolbypassrls AS bypass
    FROM pg_roles
    WHERE rolname = current_user
  `
  const row = rows[0]
  if (!row || !row.bypass) {
    throw new Error(
      `Worker DB role '${row?.rolname ?? 'unknown'}' does not have BYPASSRLS — ` +
        'background jobs would silently see 0 rows for cross-tenant scans. ' +
        'Set WORKER_DATABASE_URL to a role with BYPASSRLS.',
    )
  }
}

/**
 * Open a Drizzle transaction with `app.current_tenant_id` set via SET LOCAL
 * (transaction-scoped). Use for staff endpoints that need RLS isolation.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(
      drizzleSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
    )
    return fn(tx)
  })
}

/**
 * Open a Drizzle transaction with `app.current_player_id` set. Player endpoints
 * are cross-tenant; do NOT set tenant_id here (doc12 §4.1).
 */
export async function withPlayerContext<T>(
  playerId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(
      drizzleSql`SELECT set_config('app.current_player_id', ${playerId}, true)`,
    )
    return fn(tx)
  })
}

/**
 * Open a Drizzle transaction with `app.current_system_admin_id` set. Internal
 * panel only — must run behind IP whitelist + MFA (doc12 §4.4).
 */
export async function withSystemAdminContext<T>(
  systemAdminId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(
      drizzleSql`SELECT set_config('app.current_system_admin_id', ${systemAdminId}, true)`,
    )
    return fn(tx)
  })
}

async function applyContext(tx: TransactionSql, opts: ContextOpts): Promise<void> {
  if (opts.role) {
    if (!ALLOWED_ROLES.has(opts.role)) {
      throw new Error(`Invalid AppRole: ${opts.role}`)
    }
    await tx.unsafe(`SET LOCAL ROLE ${opts.role}`)
  }
  if (opts.tenantId !== undefined && opts.tenantId !== null) {
    await tx`SELECT set_config('app.current_tenant_id', ${opts.tenantId}, true)`
  }
  if (opts.playerId !== undefined && opts.playerId !== null) {
    await tx`SELECT set_config('app.current_player_id', ${opts.playerId}, true)`
  }
  if (opts.systemAdminId !== undefined && opts.systemAdminId !== null) {
    await tx`SELECT set_config('app.current_system_admin_id', ${opts.systemAdminId}, true)`
  }
  if (opts.jwtClaims) {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(opts.jwtClaims)}, true)`
  }
}

export async function withContext<T>(
  opts: ContextOpts,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = getSql()
  return sql.begin(async (tx) => {
    await applyContext(tx, opts)
    return fn(tx)
  }) as Promise<T>
}

/**
 * Like withContext but always rolls back. Use for tests that may insert/update.
 */
export async function withContextRollback<T>(
  opts: ContextOpts,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = getSql()
  let captured: T
  let captureErr: unknown = null
  try {
    await sql.begin(async (tx) => {
      await applyContext(tx, opts)
      try {
        captured = await fn(tx)
      } catch (e) {
        captureErr = e
      }
      throw new RollbackSignal()
    })
  } catch (e) {
    if (!(e instanceof RollbackSignal)) throw e
  }
  if (captureErr) throw captureErr
  return captured!
}

class RollbackSignal extends Error {
  constructor() {
    super('rollback')
    this.name = 'RollbackSignal'
  }
}
