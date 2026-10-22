import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { getWhatsappMonitor } from '@/modules/super-admin/whatsapp-monitor.service'
import { cleanupAll, createTestTenant, ensureRoles, type TestTenant } from '../helpers/tenant'
import { insertCourt, insertWhatsappChat, insertWhatsappConnection } from '../helpers/factories'

/**
 * Monitor del bot (`getWhatsappMonitor`): agregados del mes calendario ART por
 * dirección y por complejo, bordes de mes en ART, backlog, chats pausados y
 * reservas nacidas en el bot. `now` fijo = 21/03/2025 12:00 ART (un mes pasado: lo sembrado con now() de la base no cae adentro). El backlog y
 * las pausas se miden contra el reloj de la base, así que se siembran relativos
 * a `now()`.
 */

const NOW = new Date('2025-03-21T15:00:00Z')

type Sql = ReturnType<typeof getSql>

async function insertMessage(
  sql: Sql,
  a: {
    tenantId: string
    chatId: string
    direction: 'inbound' | 'outbound' | 'owner'
    createdAt: string // SQL timestamptz expression text, ej. '2025-03-05T12:00:00Z'
    input?: number
    cached?: number
    output?: number
    processed?: boolean
  },
) {
  await sql`
    INSERT INTO whatsapp_messages (
      tenant_id, chat_id, direction, body, created_at, processed_at,
      input_tokens, cached_tokens, output_tokens
    )
    VALUES (
      ${a.tenantId}, ${a.chatId}, ${a.direction}, 'hola', ${a.createdAt}::timestamptz,
      ${a.processed === false ? null : a.createdAt}::timestamptz,
      ${a.input ?? null}, ${a.cached ?? null}, ${a.output ?? null}
    )
  `
}

let tenantA: TestTenant
let tenantB: TestTenant

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  tenantA = await createTestTenant(sql, { name: 'Complejo A' })
  tenantB = await createTestTenant(sql, { name: 'Complejo B' })
  await insertWhatsappConnection(sql, { tenantId: tenantA.id })
  await insertWhatsappConnection(sql, { tenantId: tenantB.id, enabled: false })
  await sql`UPDATE whatsapp_connections SET display_phone_number = '+54 11 0000-0000' WHERE tenant_id = ${tenantA.id}`

  const chatA = await insertWhatsappChat(sql, { tenantId: tenantA.id })
  const chatA2 = await insertWhatsappChat(sql, { tenantId: tenantA.id })
  const chatB = await insertWhatsappChat(sql, { tenantId: tenantB.id })

  // A, marzo: 2 entrantes, 1 saliente (con tokens), 1 echo del dueño.
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'inbound',
    createdAt: '2025-03-05T12:00:00Z',
  })
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'inbound',
    createdAt: '2025-03-06T12:00:00Z',
  })
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'outbound',
    createdAt: '2025-03-06T12:00:05Z',
    input: 1_000_000,
    cached: 2_000_000,
    output: 100_000,
  })
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'owner',
    createdAt: '2025-03-07T12:00:00Z',
  })
  // Borde ART: 01:00 ART del 1/3 (04:00Z) es marzo; 23:30 ART del 28/2 (02:30Z del 1/3) es febrero.
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'inbound',
    createdAt: '2025-03-01T04:00:00Z',
  })
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'inbound',
    createdAt: '2025-03-01T02:30:00Z',
    input: 9_000_000,
  })
  // Borde de fin de mes: 23:30 ART del 31/3 (02:30Z del 1/4) todavía es marzo; 01:00 ART del 1/4 no.
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'outbound',
    createdAt: '2025-04-01T02:30:00Z',
  })
  await insertMessage(sql, {
    tenantId: tenantA.id,
    chatId: chatA,
    direction: 'outbound',
    createdAt: '2025-04-01T04:00:00Z',
    input: 9_000_000,
  })

  // B: un entrante de marzo.
  await insertMessage(sql, {
    tenantId: tenantB.id,
    chatId: chatB,
    direction: 'inbound',
    createdAt: '2025-03-10T12:00:00Z',
  })

  // Backlog de A: sin procesar hace 10 min (cuenta), hace 1 min (todavía no), hace 7 h (ya no).
  for (const interval of ['10 minutes', '1 minute', '7 hours']) {
    await sql`
      INSERT INTO whatsapp_messages (tenant_id, chat_id, direction, body, created_at)
      VALUES (${tenantA.id}, ${chatA2}, 'inbound', 'hola', now() - ${interval}::interval)
    `
  }

  // Pausados de A: uno vigente por error del bot, uno vencido, uno vigente del dueño.
  await sql`UPDATE whatsapp_chats SET pause_reason = 'bot_error', paused_until = now() + interval '1 hour' WHERE id = ${chatA}`
  await sql`UPDATE whatsapp_chats SET pause_reason = 'owner_replied', paused_until = now() + interval '1 hour' WHERE id = ${chatA2}`
  await sql`UPDATE whatsapp_chats SET pause_reason = 'bot_error', paused_until = now() - interval '1 hour' WHERE id = ${chatB}`

  // Reservas del bot de A: 2 de marzo (1 con seña paga), 1 de febrero, 1 sin chat.
  const courtId = await insertCourt(sql, tenantA.id)
  const insertBot = async (chat: string | null, created: string, deposit: string, date: string) => {
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end, starts_at, ends_at,
        price_snapshot, deposit_amount, deposit_status, payment_method, whatsapp_chat_id, created_at
      )
      VALUES (
        ${tenantA.id}, ${courtId}, ${date}, '14:00', '15:00',
        (${date}::date + time '14:00') AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (${date}::date + time '15:00') AT TIME ZONE 'America/Argentina/Buenos_Aires',
        800000, ${deposit === 'paid' ? 240000 : 0}, ${deposit}, ${deposit === 'paid' ? 'cash' : null},
        ${chat}, ${created}::timestamptz
      )
    `
  }
  await insertBot(chatA, '2025-03-12T12:00:00Z', 'paid', '2026-12-01')
  await insertBot(chatA, '2025-03-13T12:00:00Z', 'not_required', '2026-12-02')
  await insertBot(chatA, '2025-02-28T12:00:00Z', 'paid', '2026-12-03')
  await insertBot(null, '2025-03-14T12:00:00Z', 'not_required', '2026-12-04')
}, 60_000)

afterAll(async () => {
  await closeSql()
})

describe('getWhatsappMonitor', () => {
  it('cuenta el mes en ART por dirección, con los bordes de mes', async () => {
    const m = await getWhatsappMonitor(NOW)
    expect(m.month).toBe('2025-03')
    // Entrantes de A: 5/3, 6/3 y 1/3 01:00 ART (el de 23:30 ART del 28/2 queda afuera) + 1 de B.
    // Salientes: 6/3 y 23:30 ART del 31/3 (el de 01:00 ART del 1/4 queda afuera). Echo: 7/3.
    expect(m.kapso.byDirection).toEqual({ inbound: 4, outbound: 2, owner: 1 })
    expect(m.kapso.total).toBe(7)
    expect(m.kapso.limit).toBe(2000)
    expect(m.kapso.pct).toBeCloseTo((7 / 2000) * 100, 10)
  })

  it('los tokens de otros meses no entran al gasto', async () => {
    const m = await getWhatsappMonitor(NOW)
    expect(m.anthropic.tokens).toEqual({ input: 1_000_000, cached: 2_000_000, output: 100_000 })
    // 1M × 0,10 + 2M × 0,01 + 0,1M × 0,50
    expect(m.anthropic.costUsd).toBeCloseTo(0.1 + 0.02 + 0.05, 10)
  })

  it('agrega por complejo con nombre, estado y gasto', async () => {
    const m = await getWhatsappMonitor(NOW)
    const a = m.tenants.find((t) => t.tenantId === tenantA.id)!
    const b = m.tenants.find((t) => t.tenantId === tenantB.id)!
    expect(m.tenants).toHaveLength(2)
    expect(a).toMatchObject({
      name: 'Complejo A',
      slug: tenantA.slug,
      displayPhoneNumber: '+54 11 0000-0000',
      status: 'connected',
      enabled: true,
      monthMessages: 6,
    })
    expect(a.monthUsd).toBeCloseTo(0.17, 10)
    expect(b).toMatchObject({ name: 'Complejo B', enabled: false, monthMessages: 1, monthUsd: 0 })
    expect(a.lastOutboundAt).toBeInstanceOf(Date)
    expect(b.lastOutboundAt).toBeNull()
  })

  it('backlog: solo entrantes sin procesar de entre 2 min y 6 h', async () => {
    const m = await getWhatsappMonitor(NOW)
    expect(m.tenants.find((t) => t.tenantId === tenantA.id)!.backlog).toBe(1)
    expect(m.tenants.find((t) => t.tenantId === tenantB.id)!.backlog).toBe(0)
  })

  it('chats pausados ahora, por motivo (el vencido no cuenta)', async () => {
    const m = await getWhatsappMonitor(NOW)
    expect(m.tenants.find((t) => t.tenantId === tenantA.id)!.pausedByReason).toEqual({
      bot_error: 1,
      owner_replied: 1,
    })
    expect(m.tenants.find((t) => t.tenantId === tenantB.id)!.pausedByReason).toEqual({})
  })

  it('reservas del mes nacidas en el bot y cuántas tienen la seña paga', async () => {
    const m = await getWhatsappMonitor(NOW)
    const a = m.tenants.find((t) => t.tenantId === tenantA.id)!
    expect(a.botBookings).toBe(2)
    expect(a.botBookingsDepositPaid).toBe(1)
    expect(m.tenants.find((t) => t.tenantId === tenantB.id)!.botBookings).toBe(0)
  })

  it('no expone cuerpos, teléfonos de jugadores ni nombres de contactos', async () => {
    const m = await getWhatsappMonitor(NOW)
    const json = JSON.stringify(m)
    expect(json).not.toContain('hola')
    expect(json).not.toMatch(/54911\d{8}/)
  })
})
