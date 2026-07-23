import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { ensureRoles } from '../helpers/tenant'
import { purgeProcessedWebhooks } from '@/shared/jobs/workers/data-retention-cleanup.worker'

// D5 (auditoría de datos, 2026-07-23): automatiza la purga MANUAL que doc19
// (runbook §3.3) documentaba como comando de emergencia para
// `processed_webhooks` (> 30 días, disk space). `processed_webhooks` es una
// tabla GLOBAL sin tenant_id compartida por muchos specs de integración
// (mp-webhook*, billing*, payments*, dunning) — igual que
// webhook-payload-jsonb.test.ts, se aísla con un prefijo dedicado en
// `mp_event_id` + DELETE puntual en beforeAll/afterAll, sin tocar
// `cleanupAll` (que hace TRUNCATE de toda la tabla y afectaría a otros
// specs si corrieran en la misma corrida).

const PREFIX = 'retention-purge-test-'

async function insertWebhook(
  sql: ReturnType<typeof getSql>,
  mpEventId: string,
  daysAgo: number,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO processed_webhooks (mp_event_id, event_type, processed_at)
    VALUES (
      ${mpEventId},
      ${'payment'},
      NOW() - INTERVAL '${sql.unsafe(String(daysAgo))} days'
    )
    RETURNING id
  `
  return row!.id
}

async function existsById(sql: ReturnType<typeof getSql>, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM processed_webhooks WHERE id = ${id}
  `
  return rows.length > 0
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await sql`DELETE FROM processed_webhooks WHERE mp_event_id LIKE ${PREFIX + '%'}`
}, 30_000)

afterAll(async () => {
  const sql = getSql()
  await sql`DELETE FROM processed_webhooks WHERE mp_event_id LIKE ${PREFIX + '%'}`
  await closeSql()
})

describe('purgeProcessedWebhooks — retención global 30 días (D5)', () => {
  it('borra filas > 30 días y conserva las frescas; re-correr es idempotente', async () => {
    const sql = getSql()
    const oldId = await insertWebhook(sql, `${PREFIX}old-${Date.now()}`, 40)
    const freshId = await insertWebhook(sql, `${PREFIX}fresh-${Date.now()}`, 1)

    expect(await existsById(sql, oldId)).toBe(true)
    expect(await existsById(sql, freshId)).toBe(true)

    await purgeProcessedWebhooks()

    expect(await existsById(sql, oldId)).toBe(false)
    expect(await existsById(sql, freshId)).toBe(true)

    // Idempotencia: la segunda corrida no falla y no toca la fila fresca
    // (la vieja ya no existe, así que no hay nada más que purgar).
    await expect(purgeProcessedWebhooks()).resolves.toBeUndefined()
    expect(await existsById(sql, freshId)).toBe(true)
  }, 30_000)
})
