import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { createTestPlayer, ensureRoles } from '../helpers/tenant'
import {
  purgeOldAuditLogs,
  purgeOldNotifications,
} from '@/shared/jobs/workers/data-retention-cleanup.worker'

// D5 (retención por antigüedad, aprobada por el dueño 2026-07-23):
// audit_logs 24 meses, notifications 6 meses. Mismo patrón de aislamiento que
// processed-webhooks-retention.test.ts: ambas tablas las comparten muchos
// specs de integración, así que acá se aísla con un prefijo dedicado
// (`action` / `trigger_event`) + DELETE puntual en beforeAll/afterAll, sin
// tocar `cleanupAll` (TRUNCATE de todo). Las purgas son GLOBALES por
// antigüedad — las filas de otros specs son recién insertadas (NOW()), así
// que nunca caen dentro del cutoff.

const PREFIX = 'retention-age-test-'

// Filas system-level (tenant_id NULL): audit_logs lo permite directo; en
// notifications el trigger validate_notification_recipient exige un
// recipient real (recipient_type='player' → players.id), no un tenant.
let playerId: string

async function insertAuditLog(sql: ReturnType<typeof getSql>, monthsAgo: number): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO audit_logs (
      tenant_id, actor_id, actor_type, action, resource_type, resource_id, created_at
    ) VALUES (
      NULL,
      gen_random_uuid(),
      'system',
      ${`${PREFIX}audit`},
      'test',
      gen_random_uuid(),
      NOW() - INTERVAL '${sql.unsafe(String(monthsAgo))} months'
    )
    RETURNING id
  `
  return row!.id
}

async function insertNotification(
  sql: ReturnType<typeof getSql>,
  monthsAgo: number,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO notifications (
      tenant_id, recipient_type, recipient_id, channel, trigger_event, content, created_at
    ) VALUES (
      NULL,
      'player',
      ${playerId},
      'email',
      ${`${PREFIX}notif`},
      ${sql.json({ subject: 'retention test' })},
      NOW() - INTERVAL '${sql.unsafe(String(monthsAgo))} months'
    )
    RETURNING id
  `
  return row!.id
}

async function existsById(
  sql: ReturnType<typeof getSql>,
  table: 'audit_logs' | 'notifications',
  id: string,
): Promise<boolean> {
  const rows =
    table === 'audit_logs'
      ? await sql<{ id: string }[]>`SELECT id FROM audit_logs WHERE id = ${id}`
      : await sql<{ id: string }[]>`SELECT id FROM notifications WHERE id = ${id}`
  return rows.length > 0
}

async function cleanupTestRows(sql: ReturnType<typeof getSql>): Promise<void> {
  await sql`DELETE FROM audit_logs WHERE action = ${`${PREFIX}audit`}`
  await sql`DELETE FROM notifications WHERE trigger_event = ${`${PREFIX}notif`}`
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupTestRows(sql)
  const player = await createTestPlayer(sql)
  playerId = player.id
}, 30_000)

afterAll(async () => {
  const sql = getSql()
  await cleanupTestRows(sql)
  await sql`DELETE FROM players WHERE id = ${playerId}`
  await closeSql()
})

describe('purgeOldAuditLogs — retención global 24 meses (D5)', () => {
  it('borra filas > 24 meses y conserva las más nuevas; re-correr es idempotente', async () => {
    const sql = getSql()
    const oldId = await insertAuditLog(sql, 25)
    const freshId = await insertAuditLog(sql, 23)

    expect(await existsById(sql, 'audit_logs', oldId)).toBe(true)
    expect(await existsById(sql, 'audit_logs', freshId)).toBe(true)

    await purgeOldAuditLogs()

    expect(await existsById(sql, 'audit_logs', oldId)).toBe(false)
    expect(await existsById(sql, 'audit_logs', freshId)).toBe(true)

    // Idempotencia: la segunda corrida no falla y no toca la fila vigente.
    await expect(purgeOldAuditLogs()).resolves.toBeUndefined()
    expect(await existsById(sql, 'audit_logs', freshId)).toBe(true)
  }, 30_000)
})

// Trampa anti-"local enmascara" (clase PR #30): getWorkerSql cae a
// DATABASE_URL (superusuario) en local/CI, así que las corridas de arriba no
// prueban GRANTs. 038 le había REVOCADO DELETE a turnogol_worker sobre
// audit_logs/daily_cash_closes → la purga y parte del wipe legal morían SOLO
// en prod. 057 otorga el DELETE mínimo; esto lo fija por catálogo y además
// ejercita el DELETE real bajo SET LOCAL ROLE, para que un futuro REVOKE
// bienintencionado vuelva a poner CI en rojo.
describe('grants del rol worker (migr. 057) — la purga corre bajo turnogol_worker', () => {
  it('turnogol_worker tiene DELETE sobre las tablas que purga/wipea', async () => {
    const sql = getSql()
    const rows = await sql<{ table_name: string; can_delete: boolean }[]>`
      SELECT t AS table_name, has_table_privilege('turnogol_worker', t, 'DELETE') AS can_delete
      FROM unnest(ARRAY['audit_logs', 'notifications', 'daily_cash_closes']) AS t
    `
    for (const row of rows) {
      expect(row, `DELETE sobre ${row.table_name}`).toMatchObject({ can_delete: true })
    }
    expect(rows).toHaveLength(3)
  })

  it('los DELETE de purga ejecutan bajo SET LOCAL ROLE turnogol_worker (no solo por catálogo)', async () => {
    const sql = getSql()
    const oldAuditId = await insertAuditLog(sql, 25)
    const oldNotifId = await insertNotification(sql, 7)

    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE turnogol_worker`
      await tx`DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '24 months'`
      await tx`DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '6 months'`
    })

    expect(await existsById(sql, 'audit_logs', oldAuditId)).toBe(false)
    expect(await existsById(sql, 'notifications', oldNotifId)).toBe(false)
  }, 30_000)
})

describe('purgeOldNotifications — retención global 6 meses (D5)', () => {
  it('borra filas > 6 meses y conserva las más nuevas; re-correr es idempotente', async () => {
    const sql = getSql()
    const oldId = await insertNotification(sql, 7)
    const freshId = await insertNotification(sql, 5)

    expect(await existsById(sql, 'notifications', oldId)).toBe(true)
    expect(await existsById(sql, 'notifications', freshId)).toBe(true)

    await purgeOldNotifications()

    expect(await existsById(sql, 'notifications', oldId)).toBe(false)
    expect(await existsById(sql, 'notifications', freshId)).toBe(true)

    // Idempotencia: la segunda corrida no falla y no toca la fila vigente.
    await expect(purgeOldNotifications()).resolves.toBeUndefined()
    expect(await existsById(sql, 'notifications', freshId)).toBe(true)
  }, 30_000)
})
