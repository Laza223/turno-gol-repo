import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql, getWorkerDb } from '@/shared/db/client'
import { clearFeatureFlagCache } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'
import { artDateOf } from '@/shared/time/art-date'
import {
  resetEmailProvider,
  setEmailProvider,
  type EmailProvider,
} from '@/modules/notifications/email.provider'
import { monthWindowArt } from '@/modules/super-admin/whatsapp-monitor.service'
import { runWhatsappOpsAlerts } from '@/modules/super-admin/whatsapp-ops-alerts.service'
import {
  markWhatsappDisconnected,
  restoreWhatsappConnection,
} from '@/modules/whatsapp-bot/whatsapp-bot.connection'
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
 *
 * El health de los números va con `fetch` mockeado: nunca contra la API real
 * de Kapso.
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

describe('runWhatsappOpsAlerts: salud de los números (Kapso mockeado)', () => {
  const APP_URL = 'https://app.test.local'
  const WEBHOOK_URL = `${APP_URL}/api/webhooks/whatsapp`
  const fetchMock = vi.fn<typeof fetch>()

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const DISCONNECTED = {
    status: 'unhealthy',
    checks: { phone_number_connection: { passed: false, details: { status: 'DISCONNECTED' } } },
  }
  const HEALTHY = {
    status: 'healthy',
    checks: { phone_number_connection: { passed: true, details: { status: 'CONNECTED' } } },
  }

  const NOT_FOUND = () => json({ error: 'not found' }, 404)

  /** Cada llamada arma su Response: un body se lee una sola vez. */
  function kapso(routes: {
    health: () => Response
    webhooks?: () => Response
    number?: () => Response
  }) {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/health')) return routes.health()
      if (url.endsWith('/webhooks') && routes.webhooks) return routes.webhooks()
      if (/\/whatsapp\/phone_numbers\/[^/]+$/.test(url) && routes.number) return routes.number()
      throw new Error(`fetch inesperado: ${url}`)
    })
  }

  function healthCalls(): number {
    return fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/health')).length
  }

  /** Mediodía ART: el día del mail no cambia entre ticks. */
  const T0 = new Date('2026-10-15T15:00:00Z')
  const DAY = artDateOf(T0)

  /** El tick `n` del cron, a 5 min del anterior. Caído cuenta con dos lecturas seguidas. */
  function tick(n: number) {
    return runWhatsappOpsAlerts(getWorkerDb(), new Date(T0.getTime() + n * 5 * 60_000))
  }

  function suspicionKey(tenantId: string) {
    return `wa-sospecha:${tenantId}:pn-${tenantId}`
  }

  async function enablePlus(tenantId: string) {
    await getSql()`
      INSERT INTO feature_flags (key, value, tenant_id) VALUES ('whatsapp_bot', true, ${tenantId})
    `
  }

  async function addPlusTenant() {
    const other = await createTestTenant(getSql())
    await insertWhatsappConnection(getSql(), { tenantId: other.id })
    await enablePlus(other.id)
  }

  async function connectionStatus(tenantId: string): Promise<string | undefined> {
    const rows = await getSql()<{ status: string }[]>`
      SELECT status FROM whatsapp_connections WHERE tenant_id = ${tenantId}
    `
    return rows[0]?.status
  }

  async function setDisconnected(tenantId: string) {
    await getSql()`
      UPDATE whatsapp_connections SET status = 'disconnected' WHERE tenant_id = ${tenantId}
    `
  }

  async function audits(tenantId: string) {
    return getSql()<{ action: string; metadata: Record<string, unknown> | null }[]>`
      SELECT action, metadata FROM audit_logs
      WHERE tenant_id = ${tenantId} AND action LIKE 'whatsapp.%'
      ORDER BY created_at
    `
  }

  beforeEach(async () => {
    clearFeatureFlagCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('KAPSO_API_KEY', 'k-test')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
    await enablePlus(tenant.id)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sin TurnoGol Plus no consulta a Kapso', async () => {
    await getSql()`DELETE FROM feature_flags WHERE tenant_id = ${tenant.id}`
    kapso({ health: () => json(DISCONNECTED) })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sent).toEqual([])
  })

  it('desconectado dos ticks seguidos: un mail por día con el nombre del complejo, y queda disconnected', async () => {
    kapso({ health: () => json(DISCONNECTED) })

    // La primera lectura caída solo deja la sospecha.
    await tick(0)
    expect(sent).toEqual([])
    expect(await alertKeys(getSql())).toEqual([suspicionKey(tenant.id)])
    expect(await connectionStatus(tenant.id)).toBe('connected')

    await tick(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe(`WhatsApp de ${tenant.name}: el número se desconectó`)
    expect(sent[0]?.text).toContain('El asistente está prendido')
    expect(sent[0]?.text).toContain('Ajustes > Asistente de WhatsApp')
    // Desconectado, la sospecha se borra.
    expect(await alertKeys(getSql())).toEqual([`wa-numero-caido:${tenant.id}:${DAY}`])
    expect(await connectionStatus(tenant.id)).toBe('disconnected')
    expect(await audits(tenant.id)).toEqual([
      {
        action: 'whatsapp.disconnected',
        metadata: { phoneNumberId: `pn-${tenant.id}`, cause: 'desconectado' },
      },
    ])

    // Sigue caído: se vuelve a mirar, pero el mismo día no hay otro mail ni otro audit.
    await tick(2)
    expect(healthCalls()).toBe(3)
    expect(sent).toHaveLength(1)
    expect(await audits(tenant.id)).toHaveLength(1)
  })

  it('una lectura caída y después una sana: ni mail ni desconexión, y la sospecha se olvida', async () => {
    kapso({ health: () => json(DISCONNECTED) })
    await tick(0)
    kapso({ health: () => json(HEALTHY) })
    await tick(1)
    expect(await alertKeys(getSql())).toEqual([])

    // La caída siguiente vuelve a empezar de cero.
    kapso({ health: () => json(DISCONNECTED) })
    await tick(2)
    expect(sent).toEqual([])
    expect(await connectionStatus(tenant.id)).toBe('connected')
    expect(await audits(tenant.id)).toEqual([])
  })

  it('un tick que no pudo mirar en el medio no pierde la sospecha', async () => {
    kapso({ health: () => json(DISCONNECTED) })
    await tick(0)
    kapso({ health: () => json({ error: 'boom' }, 500) })
    await tick(1)
    kapso({ health: () => json(DISCONNECTED) })
    await tick(2)
    expect(sent).toHaveLength(1)
    expect(await connectionStatus(tenant.id)).toBe('disconnected')
  })

  it('una sospecha de hace más de 15 min no confirma: la caída vuelve a empezar', async () => {
    kapso({ health: () => json(DISCONNECTED) })
    await tick(0)
    await tick(4)
    expect(sent).toEqual([])
    expect(await connectionStatus(tenant.id)).toBe('connected')

    await tick(5)
    expect(sent).toHaveLength(1)
    expect(await connectionStatus(tenant.id)).toBe('disconnected')
  })

  it('si el dueño reconecta, una lectura caída vieja no lo desconecta de nuevo sin confirmar', async () => {
    kapso({ health: () => json(DISCONNECTED) })
    await tick(0)
    await tick(1)
    expect(await connectionStatus(tenant.id)).toBe('disconnected')

    await getSql()`
      UPDATE whatsapp_connections SET status = 'connected' WHERE tenant_id = ${tenant.id}
    `
    await tick(2)
    expect(await connectionStatus(tenant.id)).toBe('connected')
    expect(await audits(tenant.id)).toHaveLength(1)

    await tick(3)
    expect(await connectionStatus(tenant.id)).toBe('disconnected')
    expect(await audits(tenant.id)).toHaveLength(2)
  })

  it('el mail dice si el asistente está apagado', async () => {
    await getSql()`UPDATE whatsapp_connections SET enabled = false WHERE tenant_id = ${tenant.id}`
    kapso({ health: () => json(DISCONNECTED) })
    await tick(0)
    await tick(1)
    expect(sent[0]?.text).toContain('El asistente está apagado')
  })

  it.each([
    ['404 (y el número tampoco aparece)', NOT_FOUND, 'no_existe'],
    [
      'acceso perdido',
      () => json({ status: 'unhealthy', checks: { phone_number_access: { passed: false } } }),
      'sin_acceso',
    ],
  ] as const)('%s dos ticks seguidos: mail y disconnected', async (_label, health, cause) => {
    kapso({ health, number: NOT_FOUND })
    await tick(0)
    await tick(1)
    expect(sent).toHaveLength(1)
    expect(await connectionStatus(tenant.id)).toBe('disconnected')
    expect((await audits(tenant.id))[0]?.metadata).toMatchObject({ cause })
  })

  it('health 404 de un número que Kapso sí tiene: cambió la API, monitor ciego sin desconectar a nadie', async () => {
    await addPlusTenant()
    kapso({
      health: NOT_FOUND,
      number: () => json({ data: { id: `pn-${tenant.id}`, display_phone_number: '+54 9 11' } }),
    })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(healthCalls()).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('No pudimos revisar los números de WhatsApp')
    expect(await connectionStatus(tenant.id)).toBe('connected')
    expect(await audits(tenant.id)).toEqual([])
  })

  it('si falla la escritura del estado, los mails del tick salen igual', async () => {
    await addPlusTenant()
    const sql = getSql()
    await sql`
      CREATE FUNCTION test_wa_update_falla() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'falla de prueba'; END $$
    `
    await sql`
      CREATE TRIGGER test_wa_update_falla BEFORE UPDATE ON whatsapp_connections
      FOR EACH ROW EXECUTE FUNCTION test_wa_update_falla()
    `
    try {
      kapso({ health: () => json(DISCONNECTED) })
      await tick(0)
      await tick(1)
      expect(healthCalls()).toBe(4)
      expect(sent).toHaveLength(2)
      expect(await connectionStatus(tenant.id)).toBe('connected')
    } finally {
      await sql`DROP TRIGGER test_wa_update_falla ON whatsapp_connections`
      await sql`DROP FUNCTION test_wa_update_falla()`
    }
  })

  it('marcar desconectado no pisa la conexión si el dueño ya conectó otro número', async () => {
    const flipped = await markWhatsappDisconnected(
      getWorkerDb(),
      { tenantId: tenant.id, phoneNumberId: 'pn-viejo' },
      'desconectado',
    )
    expect(flipped).toBe(false)
    expect(await connectionStatus(tenant.id)).toBe('connected')
    expect(await audits(tenant.id)).toEqual([])
  })

  it('restaurar una conexión que ya está connected no hace nada ni audita', async () => {
    kapso({ health: () => json(HEALTHY), webhooks: () => json({ data: [{ url: WEBHOOK_URL }] }) })
    const flipped = await restoreWhatsappConnection(getWorkerDb(), {
      tenantId: tenant.id,
      phoneNumberId: `pn-${tenant.id}`,
    })
    expect(flipped).toBe(false)
    expect(await audits(tenant.id)).toEqual([])
  })

  it('bloqueado dos ticks seguidos: mail, pero la conexión queda connected (no se arregla reconectando)', async () => {
    kapso({
      health: () =>
        json({ status: 'unhealthy', checks: { messaging_health: { overall_status: 'BLOCKED' } } }),
    })
    await tick(0)
    expect(sent).toEqual([])
    await tick(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('Meta frenó los envíos')
    expect(sent[0]?.text).toContain('saldo de Kapso')
    expect(await connectionStatus(tenant.id)).toBe('connected')
    expect(await audits(tenant.id)).toEqual([])
  })

  it.each([
    [
      'degraded',
      () =>
        json({ status: 'degraded', checks: { messaging_health: { overall_status: 'LIMITED' } } }),
    ],
    ['status error', () => json({ status: 'error', error: 'Service temporarily unavailable' })],
    ['500', () => json({ error: 'boom' }, 500)],
    [
      'timeout',
      (): Response => {
        throw new Error('timeout')
      },
    ],
  ] as const)('%s: sin mail y sin tocar la conexión', async (_label, health) => {
    kapso({ health })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])
    expect(await alertKeys(getSql())).toEqual([])
    expect(await connectionStatus(tenant.id)).toBe('connected')
  })

  it('si Kapso falla, las alertas de conteo salen igual', async () => {
    await seedMonthMessages(getSql(), 1600)
    kapso({ health: () => json({ error: 'boom' }, 500) })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent.map((s) => s.subject)).toEqual([
      'Bot de WhatsApp: llegó al 80% de los mensajes del mes',
    ])
  })

  it.each([
    ['401 (clave rechazada)', () => json({ error: 'unauthorized' }, 401), 'rechazó la clave'],
    ['respuesta ilegible', () => json({ status: 'raro' }), 'no entendemos'],
  ] as const)('%s: corta el tick y un solo mail por día', async (_label, health, line) => {
    await addPlusTenant()
    kapso({ health })

    await runWhatsappOpsAlerts(getWorkerDb())
    expect(healthCalls()).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('No pudimos revisar los números de WhatsApp')
    expect(sent[0]?.text).toContain(line)
    expect(await alertKeys(getSql())).toEqual([`kapso-health:${artDateOf(new Date())}`])

    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
  })

  it('sin KAPSO_API_KEY avisa que el monitor está ciego, sin llamar a la red', async () => {
    vi.stubEnv('KAPSO_API_KEY', '')
    kapso({ health: () => json(HEALTHY) })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sent[0]?.text).toContain('Falta KAPSO_API_KEY')
  })

  it('429: corta el tick sin mail (el límite es por proyecto) y loguea cuántos quedaron', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    await addPlusTenant()
    kapso({ health: () => json({ error: 'rate limited' }, 429) })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(healthCalls()).toBe(1)
    expect(sent).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      'whatsapp: se corta la revisión de los números hasta el próximo tick',
      expect.objectContaining({ status: 429, unchecked: 1 }),
    )
  })

  it('3 errores de red seguidos cortan el tick; una respuesta en el medio corta la racha', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 5; i++) await addPlusTenant()
    const replies: (() => Response)[] = [
      () => {
        throw new Error('timeout')
      },
      () => json({ error: 'boom' }, 500),
    ]
    let call = 0
    kapso({
      health: () => {
        const reply = replies[call++]
        if (reply) return reply()
        throw new Error('timeout')
      },
    })
    await runWhatsappOpsAlerts(getWorkerDb())
    // timeout, 500, timeout, timeout, timeout: corta en la 5ª y el 6º queda sin mirar.
    expect(healthCalls()).toBe(5)
    expect(sent).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      'whatsapp: se corta la revisión de los números hasta el próximo tick',
      expect.objectContaining({ status: 0, unchecked: 1 }),
    )
  })

  it('vuelve solo: un disconnected que da sano, con el webhook suscrito, vuelve a connected', async () => {
    await setDisconnected(tenant.id)
    kapso({
      health: () => json(HEALTHY),
      webhooks: () => json({ data: [{ url: WEBHOOK_URL }] }),
    })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toEqual([])
    expect(await connectionStatus(tenant.id)).toBe('connected')
    expect(await audits(tenant.id)).toEqual([
      { action: 'whatsapp.reconnected', metadata: { phoneNumberId: `pn-${tenant.id}` } },
    ])
  })

  it('sin nuestro webhook no vuelve solo: sería un bot mudo, que reconecte el dueño', async () => {
    await setDisconnected(tenant.id)
    kapso({
      health: () => json(HEALTHY),
      webhooks: () => json({ data: [{ url: 'https://otra.app/hook' }] }),
    })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(await connectionStatus(tenant.id)).toBe('disconnected')
    expect(await audits(tenant.id)).toEqual([])
  })

  it('un disconnected que sigue caído manda su mail del día y no se audita de nuevo', async () => {
    await setDisconnected(tenant.id)
    kapso({ health: () => json(DISCONNECTED) })
    await runWhatsappOpsAlerts(getWorkerDb())
    expect(sent).toHaveLength(1)
    expect(await audits(tenant.id)).toEqual([])
  })
})
