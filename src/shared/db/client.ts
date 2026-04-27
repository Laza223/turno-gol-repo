import postgres, { type Sql, type TransactionSql } from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql as drizzleSql } from 'drizzle-orm'
import * as schema from './schema'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

export type AppRole = 'authenticated' | 'anon' | 'service_role' | 'turnogol_app'

export type ContextOpts = {
  tenantId?: string | null
  playerId?: string | null
  systemAdminId?: string | null
  role?: AppRole
  jwtClaims?: Record<string, unknown>
}

let _sql: Sql | null = null

export function getSql(): Sql {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL ?? DEFAULT_URL
  _sql = postgres(url, {
    max: 10,
    prepare: false,
    onnotice: () => {},
  })
  return _sql
}

export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 })
    _sql = null
    _db = null
  }
}

// ─── Drizzle wrapper ────────────────────────────────────────────────
// Comparte el mismo pool de postgres v3 (getSql) — un solo connection pool.

export type Db = PostgresJsDatabase<typeof schema>
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0]

let _db: Db | null = null

export function getDb(): Db {
  if (_db) return _db
  _db = drizzle(getSql(), { schema })
  return _db
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

export async function withRollback<T>(
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = getSql()
  let captured: T
  try {
    await sql.begin(async (tx) => {
      captured = await fn(tx)
      throw new RollbackSignal()
    })
  } catch (e) {
    if (e instanceof RollbackSignal) return captured!
    throw e
  }
  return captured!
}

class RollbackSignal extends Error {
  constructor() {
    super('rollback')
    this.name = 'RollbackSignal'
  }
}
