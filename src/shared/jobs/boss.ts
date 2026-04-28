import PgBoss from 'pg-boss'

const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

let _boss: PgBoss | null = null

/**
 * Returns the singleton pg-boss instance, starting it on first call.
 *
 * Schema isolation: pg-boss tables live under the `pgboss` schema (default),
 * keeping them out of the application schema. Migrations don't manage this
 * schema — pg-boss creates/migrates it on `start()`.
 */
export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss
  const url = process.env.DATABASE_URL ?? DEFAULT_URL
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss' })
  boss.on('error', (err) => {
    console.error('[pg-boss] error', err)
  })
  await boss.start()
  _boss = boss
  return boss
}

export async function stopBoss(): Promise<void> {
  if (!_boss) return
  await _boss.stop({ graceful: true, timeout: 5000 })
  _boss = null
}
