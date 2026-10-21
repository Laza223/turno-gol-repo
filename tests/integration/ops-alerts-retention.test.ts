import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { purgeOpsAlerts } from '@/shared/jobs/workers/data-retention-cleanup.worker'
import { ensureRoles } from '../helpers/tenant'

// `ops_alerts` (migr. 097): purga global de más de 90 días, mismo estilo que
// push-send-log-retention.test.ts (prefijo propio + DELETE puntual, sin tocar
// el resto de la tabla).
const PREFIX = 'ops-alerts-retention-test-'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await sql`DELETE FROM ops_alerts WHERE key LIKE ${PREFIX + '%'}`
}, 30_000)

afterAll(async () => {
  await getSql()`DELETE FROM ops_alerts WHERE key LIKE ${PREFIX + '%'}`
  await closeSql()
})

describe('purgeOpsAlerts — retención de 90 días', () => {
  it('borra las de más de 90 días y conserva las frescas; re-correr es idempotente', async () => {
    const sql = getSql()
    await sql`
      INSERT INTO ops_alerts (key, created_at) VALUES
        (${PREFIX + 'old'}, now() - interval '100 days'),
        (${PREFIX + 'fresh'}, now() - interval '10 days')
    `
    await purgeOpsAlerts()
    await expect(purgeOpsAlerts()).resolves.toBeUndefined()
    const rows = await sql<{ key: string }[]>`
      SELECT key FROM ops_alerts WHERE key LIKE ${PREFIX + '%'}
    `
    expect(rows.map((r) => r.key)).toEqual([PREFIX + 'fresh'])
  }, 30_000)
})
