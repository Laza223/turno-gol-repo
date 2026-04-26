import postgres, { type Sql, type TransactionSql } from 'postgres'

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
  }
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
