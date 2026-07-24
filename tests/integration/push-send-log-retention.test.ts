import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { ensureRoles } from '../helpers/tenant'
import { purgePushSendLog } from '@/shared/jobs/workers/data-retention-cleanup.worker'

// F3 (hallazgo D4, 2026-07-24): purga GLOBAL de `push_send_log` (>30 días),
// gemela semántica de `purgeProcessedWebhooks` — mismo mecanismo de
// idempotencia (INSERT ... ON CONFLICT DO NOTHING), mismo horizonte de
// retención, mismo estilo de test que processed-webhooks-retention.test.ts.
// `push_send_log` es GLOBAL sin tenant_id: se aísla con un prefijo dedicado
// en `dedupe_key` + DELETE puntual en beforeAll/afterAll, sin tocar
// `cleanupAll` (que hace TRUNCATE de toda la tabla y afectaría a otros specs
// si corrieran en la misma corrida — ver push-send-idempotency.test.ts).

const PREFIX = 'retention-purge-test-push-'

async function insertLogRow(
  sql: ReturnType<typeof getSql>,
  dedupeKey: string,
  daysAgo: number,
): Promise<void> {
  await sql`
    INSERT INTO push_send_log (dedupe_key, sent_at)
    VALUES (
      ${dedupeKey},
      NOW() - INTERVAL '${sql.unsafe(String(daysAgo))} days'
    )
  `
}

async function existsByKey(sql: ReturnType<typeof getSql>, dedupeKey: string): Promise<boolean> {
  const rows = await sql<{ dedupe_key: string }[]>`
    SELECT dedupe_key FROM push_send_log WHERE dedupe_key = ${dedupeKey}
  `
  return rows.length > 0
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await sql`DELETE FROM push_send_log WHERE dedupe_key LIKE ${PREFIX + '%'}`
}, 30_000)

afterAll(async () => {
  const sql = getSql()
  await sql`DELETE FROM push_send_log WHERE dedupe_key LIKE ${PREFIX + '%'}`
  await closeSql()
})

describe('purgePushSendLog — retención global 30 días (F3, hallazgo D4)', () => {
  it('borra filas > 30 días y conserva las frescas; re-correr es idempotente', async () => {
    const sql = getSql()
    const oldKey = `${PREFIX}old-${Date.now()}`
    const freshKey = `${PREFIX}fresh-${Date.now()}`
    await insertLogRow(sql, oldKey, 40)
    await insertLogRow(sql, freshKey, 1)

    expect(await existsByKey(sql, oldKey)).toBe(true)
    expect(await existsByKey(sql, freshKey)).toBe(true)

    await purgePushSendLog()

    expect(await existsByKey(sql, oldKey)).toBe(false)
    expect(await existsByKey(sql, freshKey)).toBe(true)

    // Idempotencia: la segunda corrida no falla y no toca la fila fresca
    // (la vieja ya no existe, así que no hay nada más que purgar).
    await expect(purgePushSendLog()).resolves.toBeUndefined()
    expect(await existsByKey(sql, freshKey)).toBe(true)
  }, 30_000)
})
