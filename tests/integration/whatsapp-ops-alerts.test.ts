import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, getWorkerDb } from '@/shared/db/client'
import {
  resetEmailProvider,
  setEmailProvider,
  type EmailProvider,
} from '@/modules/notifications/email.provider'
import { monthWindowArt } from '@/modules/super-admin/whatsapp-monitor.service'
import { runWhatsappOpsAlerts } from '@/modules/super-admin/whatsapp-ops-alerts.service'
import {
  cleanupAll,
  createTestSystemAdmin,
  createTestTenant,
  ensureRoles,
  type TestTenant,
} from '../helpers/tenant'
import { insertWhatsappChat, insertWhatsappConnection } from '../helpers/factories'

/**
 * Cron `whatsapp-ops-alerts`: un mail por clave (dedupe en `ops_alerts`), la
 * clave se libera si el envío falla, y los destinatarios son los super admins
 * activos. Los umbrales de mensajes usan el mes ART real (`new Date()`).
 */

type Sent = Parameters<EmailProvider['send']>[0]

let sent: Sent[]
let failSends: boolean
let tenant: TestTenant
let chatId: string
let activeEmail: string

type Sql = ReturnType<typeof getSql>

async function seedMonthMessages(sql: Sql, count: number) {
  await sql`
    INSERT INTO whatsapp_messages (tenant_id, chat_id, direction, body, created_at, processed_at)
    SELECT ${tenant.id}, ${chatId}, 'outbound', 'x', now(), now()
    FROM generate_series(1, ${count}::int)
  `
}

async function insertInbound(sql: Sql, interval: string) {
  await sql`
    INSERT INTO whatsapp_messages (tenant_id, chat_id, direction, body, created_at)
    VALUES (${tenant.id}, ${chatId}, 'inbound', 'x', now() - ${interval}::interval)
  `
}

async function alertKeys(sql: Sql): Promise<string[]> {
  const rows = await sql<{ key: string }[]>`SELECT key FROM ops_alerts ORDER BY key`
  return rows.map((r) => r.key)
}

beforeAll(async () => {
  await ensureRoles(getSql())
}, 30_000)

beforeEach(async () => {
  const sql = getSql()
  await cleanupAll(sql)
  tenant = await createTestTenant(sql)
  await insertWhatsappConnection(sql, { tenantId: tenant.id })
  chatId = await insertWhatsappChat(sql, { tenantId: tenant.id })
  const active = await createTestSystemAdmin(sql)
  activeEmail = active.email
  const inactive = await createTestSystemAdmin(sql)
  await sql`UPDATE system_admins SET status = 'inactive' WHERE id = ${inactive.id}`

  sent = []
  failSends = false
  setEmailProvider({
    send: async (params) => {
      if (failSends) throw new Error('resend caído')
      sent.push(params)
    },
  })
}, 30_000)

afterEach(() => {
  resetEmailProvider()
})

afterAll(async () => {
  await closeSql()
})

describe('runWhatsappOpsAlerts', () => {
  it('sin nada para avisar no manda ni reclama nada', async () => {
    await seedMonthMessages(getSql(), 100)
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])
    expect(await alertKeys(getSql())).toEqual([])
  })

  it('80% del plan: manda una sola vez por mes, el segundo tick no manda', async () => {
    await seedMonthMessages(getSql(), 1600)
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain('/super-admin/whatsapp')
    expect(sent[0]?.html).toContain('/super-admin/whatsapp')
    expect(await alertKeys(getSql())).toEqual([`kapso-80:${monthWindowArt(new Date()).ym}`])

    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
  })

  it('80% y 100% en el mismo tick: un solo mail, el de 100', async () => {
    await seedMonthMessages(getSql(), 2000)
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('límite')
    expect(await alertKeys(getSql())).toEqual([`kapso-100:${monthWindowArt(new Date()).ym}`])
  })

  it('después del 80%, cruzar el 100% manda un segundo mail', async () => {
    const sql = getSql()
    await seedMonthMessages(sql, 1600)
    await runWhatsappOpsAlerts(getWorkerDb())
    await seedMonthMessages(sql, 400)
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(2)
    expect(await alertKeys(sql)).toHaveLength(2)
  })

  it('si el envío falla, libera la clave y el próximo tick reintenta', async () => {
    const sql = getSql()
    await seedMonthMessages(sql, 1600)
    failSends = true
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])
    expect(await alertKeys(sql)).toEqual([])

    failSends = false
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
    expect(await alertKeys(sql)).toHaveLength(1)
  })

  it('si el proveedor tira síncrono (Resend sin API key), también libera la clave', async () => {
    const sql = getSql()
    await seedMonthMessages(sql, 1600)
    setEmailProvider({
      send: () => {
        throw new Error('Missing API key')
      },
    })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(await alertKeys(sql)).toEqual([])
  })

  it('manda solo a los super admins activos', async () => {
    await seedMonthMessages(getSql(), 1600)
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent.map((s) => s.to)).toEqual([activeEmail])
  })

  it('sin super admins activos no manda ni reclama la clave', async () => {
    const sql = getSql()
    await sql`UPDATE system_admins SET status = 'inactive'`
    await seedMonthMessages(sql, 1600)
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])
    expect(await alertKeys(sql)).toEqual([])
  })

  it('backlog: entrantes sin procesar de hace más de 5 min y menos de 6 h, uno por hora', async () => {
    const sql = getSql()
    await insertInbound(sql, '3 minutes')
    await insertInbound(sql, '7 hours')
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])

    await insertInbound(sql, '10 minutes')
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('sin contestar')
    const keys = await alertKeys(sql)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^backlog:\d{4}-\d{2}-\d{2}T\d{2}$/)

    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
  })

  it('bot_error: chats pausados vigentes, uno por hora; el vencido no cuenta', async () => {
    const sql = getSql()
    await sql`UPDATE whatsapp_chats SET pause_reason = 'owner_replied', paused_until = now() + interval '1 hour' WHERE id = ${chatId}`
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])

    await sql`UPDATE whatsapp_chats SET pause_reason = 'bot_error', paused_until = now() - interval '1 minute' WHERE id = ${chatId}`
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])

    await sql`UPDATE whatsapp_chats SET paused_until = now() + interval '1 hour' WHERE id = ${chatId}`
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('falló')
    expect((await alertKeys(sql))[0]).toMatch(/^bot-error:\d{4}-\d{2}-\d{2}T\d{2}$/)

    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
  })
})
