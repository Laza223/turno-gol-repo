import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { faker } from '@faker-js/faker'
import { closeSql } from '@/shared/db/client'
import { clearFeatureFlagCache } from '@/shared/feature-flags'
import { DAY_KEYS } from '@/shared/time/week-days'
import type { NormalizedWhatsappEvent } from '@/lib/kapso/events.schema'
import { sendWhatsappText } from '@/lib/kapso/client'
import { captureException } from '@/lib/sentry'
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { ingestWhatsappEvents } from '@/modules/whatsapp-bot/whatsapp-bot.ingest'
import { processWhatsappTurn } from '@/modules/whatsapp-bot/whatsapp-bot.turn'
import { runAgent, type AgentResult } from '@/modules/whatsapp-bot/whatsapp-bot.agent'
import { adminSql } from '../helpers/admin-db'
import { asApp, createTestTenant, ensureRoles } from '../helpers/tenant'
import {
  insertBooking,
  insertCourt,
  insertWhatsappChat,
  insertWhatsappConnection,
} from '../helpers/factories'

/**
 * Ingesta y turno del bot de WhatsApp contra Postgres real. Se mockean SOLO los
 * bordes externos (Kapso, el modelo, el push y Sentry): la base, los feature
 * flags, el RLS de las tablas y el armado del historial corren de verdad.
 */

vi.mock('@/lib/kapso/client', () => ({ sendWhatsappText: vi.fn() }))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminPush: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
// `ToolInputError` y el resto del módulo quedan reales: lo importa `whatsapp-bot.tools`.
vi.mock('@/modules/whatsapp-bot/whatsapp-bot.agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/whatsapp-bot/whatsapp-bot.agent')>()),
  runAgent: vi.fn(),
}))

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const OWNER_PAUSE_MS = 6 * HOUR_MS
const BOT_ERROR_PAUSE_MS = 30 * MINUTE_MS

type InboundEvent = Extract<NormalizedWhatsappEvent, { kind: 'inbound' }>
type OwnerEvent = Extract<NormalizedWhatsappEvent, { kind: 'owner' }>

type Seed = { tenantId: string; phoneNumberId: string; phone: string }

type ChatRow = {
  id: string
  wa_phone: string
  display_name: string | null
  paused_until: Date | null
  pause_reason: string | null
  last_inbound_at: Date
}

type MessageRow = {
  id: string
  direction: 'inbound' | 'outbound' | 'owner'
  wa_message_id: string | null
  body: string | null
  processed_at: Date | null
  input_tokens: number | null
  cached_tokens: number | null
  output_tokens: number | null
}

// El pool de la app devuelve las columnas timestamptz como texto, no como Date.
type ChatRaw = Omit<ChatRow, 'paused_until' | 'last_inbound_at'> & {
  paused_until: string | null
  last_inbound_at: string
}
type MessageRaw = Omit<MessageRow, 'processed_at'> & { processed_at: string | null }

const toDate = (value: string | null): Date | null => (value === null ? null : new Date(value))

const randomPhone = () => `54911${faker.string.numeric(8)}`
// `wa_message_id` es UNIQUE y la base no se limpia entre corridas: los ids van siempre únicos.
const waId = (prefix: string) => `wamid.${prefix}.${faker.string.uuid()}`
const ago = (now: Date, ms: number) => new Date(now.getTime() - ms)

function agentResult(text: string, trace: AgentResult['trace'] = []): AgentResult {
  return {
    text,
    usage: { inputTokens: 120, cachedTokens: 80, outputTokens: 30 },
    toolsCalled: [],
    trace,
  }
}

/**
 * Complejo con el bot prendido: conexión `enabled` y override del flag
 * `whatsapp_bot` (el global es `false`, migración 096). `botFlag: false` deja
 * el flag como está en producción para un complejo sin el extra.
 */
async function seed(opts: { enabled?: boolean; botFlag?: boolean } = {}): Promise<Seed> {
  const sql = adminSql()
  const tenant = await createTestTenant(sql)
  await insertWhatsappConnection(sql, { tenantId: tenant.id, enabled: opts.enabled ?? true })
  if (opts.botFlag ?? true) {
    await sql`
      INSERT INTO feature_flags (key, value, tenant_id)
      VALUES (${BOT_FEATURE_FLAG}, true, ${tenant.id})
    `
  }
  const [conn] = await sql<{ phone_number_id: string }[]>`
    SELECT phone_number_id FROM whatsapp_connections WHERE tenant_id = ${tenant.id}
  `
  return { tenantId: tenant.id, phoneNumberId: conn!.phone_number_id, phone: randomPhone() }
}

async function addChat(s: Seed): Promise<string> {
  return insertWhatsappChat(adminSql(), { tenantId: s.tenantId, waPhone: s.phone })
}

/** Mensaje con `created_at` explícito (el default es el reloj de la base, no el de `now`). */
async function seedMessage(
  s: Seed,
  chatId: string,
  args: {
    direction: 'inbound' | 'outbound' | 'owner'
    body: string
    createdAt: Date
    processedAt?: Date | null
  },
): Promise<string> {
  const rows = await adminSql()<{ id: string }[]>`
    INSERT INTO whatsapp_messages (
      tenant_id, chat_id, direction, wa_message_id, body, processed_at, created_at
    )
    VALUES (
      ${s.tenantId}, ${chatId}, ${args.direction}, ${waId('seed')},
      ${args.body}, ${args.processedAt ?? null}, ${args.createdAt}
    )
    RETURNING id
  `
  return rows[0]!.id
}

async function pauseChat(chatId: string, until: Date, reason: string): Promise<void> {
  await adminSql()`
    UPDATE whatsapp_chats SET paused_until = ${until}, pause_reason = ${reason}
    WHERE id = ${chatId}
  `
}

async function setConnectionEnabled(tenantId: string, enabled: boolean): Promise<void> {
  await adminSql()`UPDATE whatsapp_connections SET enabled = ${enabled} WHERE tenant_id = ${tenantId}`
}

function inboundEvent(s: Seed, over: Partial<InboundEvent> = {}): InboundEvent {
  return {
    kind: 'inbound',
    phoneNumberId: s.phoneNumberId,
    waMessageId: waId('in'),
    from: s.phone,
    contactName: 'Juan Pérez',
    messageKind: 'text',
    text: 'hola, ¿hay turno?',
    ...over,
  }
}

function ownerEvent(s: Seed, over: Partial<OwnerEvent> = {}): OwnerEvent {
  return {
    kind: 'owner',
    phoneNumberId: s.phoneNumberId,
    waMessageId: waId('owner'),
    to: s.phone,
    text: 'Hola, soy del complejo',
    ...over,
  }
}

/**
 * Conteos con el superusuario a propósito: un "0" medido con el rol de la app
 * podría ser el RLS escondiendo la fila, y entonces no probaría nada.
 */
async function countRows(tenantId: string): Promise<{ chats: number; messages: number }> {
  const [row] = await adminSql()<{ chats: number; messages: number }[]>`
    SELECT (SELECT count(*) FROM whatsapp_chats WHERE tenant_id = ${tenantId})::int AS chats,
           (SELECT count(*) FROM whatsapp_messages WHERE tenant_id = ${tenantId})::int AS messages
  `
  return row!
}

/** Lecturas de post-condición con el rol de la app: lo que el panel de producción vería. */
async function readChats(tenantId: string): Promise<ChatRow[]> {
  const rows = await asApp(
    tenantId,
    (tx) => tx<ChatRaw[]>`
      SELECT id, wa_phone, display_name, paused_until, pause_reason, last_inbound_at
      FROM whatsapp_chats WHERE tenant_id = ${tenantId} ORDER BY created_at
    `,
  )
  return rows.map((r) => ({
    ...r,
    paused_until: toDate(r.paused_until),
    last_inbound_at: new Date(r.last_inbound_at),
  }))
}

async function readMessages(tenantId: string, chatId: string): Promise<MessageRow[]> {
  const rows = await asApp(
    tenantId,
    (tx) => tx<MessageRaw[]>`
      SELECT id, direction, wa_message_id, body, processed_at,
             input_tokens, cached_tokens, output_tokens
      FROM whatsapp_messages
      WHERE tenant_id = ${tenantId} AND chat_id = ${chatId}
      ORDER BY created_at, id
    `,
  )
  return rows.map((r) => ({ ...r, processed_at: toDate(r.processed_at) }))
}

async function readChat(tenantId: string, chatId: string): Promise<ChatRow> {
  const chat = (await readChats(tenantId)).find((c) => c.id === chatId)
  expect(chat, 'el chat tiene que existir').toBeDefined()
  return chat!
}

const byId = (rows: MessageRow[], id: string) => rows.find((m) => m.id === id)!

beforeAll(async () => {
  const sql = adminSql()
  await ensureRoles(sql)
  // Sin cleanupAll a propósito: cada test crea su propio complejo (ids únicos) y no
  // necesita la base vacía. El global `whatsapp_bot` lo siembra la migración 096, pero
  // un TRUNCATE ... CASCADE de otra suite lo borra: se repone para que "flag apagado"
  // mida la fila global real y no su ausencia.
  await sql`
    INSERT INTO feature_flags (key, value, tenant_id)
    SELECT ${BOT_FEATURE_FLAG}::text, false, NULL::uuid
    WHERE NOT EXISTS (
      SELECT 1 FROM feature_flags WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id IS NULL
    )
  `
}, 30_000)

afterAll(async () => {
  await closeSql()
})

beforeEach(() => {
  // El caché de flags es por proceso (60 s): cada test arranca sin valores viejos.
  clearFeatureFlagCache()
  vi.mocked(sendWhatsappText).mockReset()
  vi.mocked(runAgent).mockReset()
  vi.mocked(notifyAdminPush).mockReset()
  vi.mocked(captureException).mockReset()
  // `wa_message_id` es UNIQUE: cada envío simulado devuelve un id propio.
  vi.mocked(sendWhatsappText).mockImplementation(async () => ({
    waMessageId: waId('out'),
  }))
  vi.mocked(runAgent).mockResolvedValue(agentResult('Respuesta del bot'))
  vi.mocked(notifyAdminPush).mockResolvedValue({ enqueued: 0 })
})

// ─── ingestWhatsappEvents ────────────────────────────────────────────────────

describe('ingestWhatsappEvents — bot apagado', () => {
  it('conexión con enabled=false: no guarda nada y cuenta el evento en botOff', async () => {
    const s = await seed({ enabled: false })
    const res = await ingestWhatsappEvents([inboundEvent(s)], new Date())

    expect(res).toEqual({ chatsToProcess: [], unknownNumbers: 0, botOff: 1 })
    expect(await countRows(s.tenantId)).toEqual({ chats: 0, messages: 0 })
  })

  it('flag whatsapp_bot apagado para el complejo: no guarda nada y cuenta el evento en botOff', async () => {
    const s = await seed({ botFlag: false })
    // Tripwire: el default de producción es el global en false. Si otra suite lo dejó
    // en true, este test mediría otra cosa.
    const [global] = await adminSql()<{ value: boolean }[]>`
      SELECT value FROM feature_flags WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id IS NULL
    `
    expect(global?.value).toBe(false)

    const res = await ingestWhatsappEvents([inboundEvent(s)], new Date())

    expect(res).toEqual({ chatsToProcess: [], unknownNumbers: 0, botOff: 1 })
    expect(await countRows(s.tenantId)).toEqual({ chats: 0, messages: 0 })
  })

  it('número que no es de ningún complejo: cuenta unknownNumbers y no guarda nada', async () => {
    const s = await seed()
    const res = await ingestWhatsappEvents(
      [inboundEvent(s, { phoneNumberId: `pn-desconocido-${faker.string.uuid()}` })],
      new Date(),
    )

    expect(res).toEqual({ chatsToProcess: [], unknownNumbers: 1, botOff: 0 })
    expect(await countRows(s.tenantId)).toEqual({ chats: 0, messages: 0 })
  })
})

describe('ingestWhatsappEvents — entrantes', () => {
  it('crea el chat y el mensaje y devuelve el chat para encolar un turno', async () => {
    const s = await seed()
    const now = new Date()
    const event = inboundEvent(s, { text: 'hola, ¿hay turno?' })
    const res = await ingestWhatsappEvents([event], now)

    const [chat] = await readChats(s.tenantId)
    expect(chat).toMatchObject({
      wa_phone: s.phone,
      display_name: 'Juan Pérez',
      paused_until: null,
      pause_reason: null,
    })
    expect(chat!.last_inbound_at).toEqual(now)
    expect(res).toEqual({
      chatsToProcess: [{ tenantId: s.tenantId, chatId: chat!.id }],
      unknownNumbers: 0,
      botOff: 0,
    })

    const messages = await readMessages(s.tenantId, chat!.id)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      direction: 'inbound',
      wa_message_id: event.waMessageId,
      body: 'hola, ¿hay turno?',
      processed_at: null,
    })
  })

  it('el mismo waMessageId de nuevo (reintento del webhook) no duplica ni vuelve a devolver el chat', async () => {
    const s = await seed()
    const event = inboundEvent(s)
    const first = await ingestWhatsappEvents([event], new Date())
    expect(first.chatsToProcess).toHaveLength(1)

    const retry = await ingestWhatsappEvents([event], new Date())

    expect(retry).toEqual({ chatsToProcess: [], unknownNumbers: 0, botOff: 0 })
    expect(await countRows(s.tenantId)).toEqual({ chats: 1, messages: 1 })
  })

  it('dos mensajes del mismo chat en un lote: un solo chat para encolar', async () => {
    const s = await seed()
    const res = await ingestWhatsappEvents(
      [inboundEvent(s, { text: 'hola' }), inboundEvent(s, { text: '¿hay turno hoy?' })],
      new Date(),
    )

    expect(res.chatsToProcess).toHaveLength(1)
    expect(await countRows(s.tenantId)).toEqual({ chats: 1, messages: 2 })
  })

  it('un evento sin nombre de perfil no pisa el displayName ya guardado', async () => {
    const s = await seed()
    await ingestWhatsappEvents([inboundEvent(s, { contactName: 'Juan Pérez' })], new Date())
    await ingestWhatsappEvents([inboundEvent(s, { contactName: null })], new Date())

    const chats = await readChats(s.tenantId)
    expect(chats).toHaveLength(1)
    expect(chats[0]!.display_name).toBe('Juan Pérez')
  })
})

describe('ingestWhatsappEvents — eco del dueño', () => {
  it('a un número SIN chat: no crea chat ni mensaje', async () => {
    const s = await seed()
    const res = await ingestWhatsappEvents([ownerEvent(s)], new Date())

    expect(res).toEqual({ chatsToProcess: [], unknownNumbers: 0, botOff: 0 })
    expect(await countRows(s.tenantId)).toEqual({ chats: 0, messages: 0 })
  })

  it('a un chat existente: guarda el mensaje owner ya procesado y pausa 6 h con owner_replied', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()

    const echo = ownerEvent(s, { text: 'Dale, te espero' })
    const res = await ingestWhatsappEvents([echo], now)

    // El eco no despierta al bot: ningún turno que encolar.
    expect(res.chatsToProcess).toEqual([])
    const messages = await readMessages(s.tenantId, chatId)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      direction: 'owner',
      wa_message_id: echo.waMessageId,
      body: 'Dale, te espero',
    })
    expect(messages[0]!.processed_at).toEqual(now)

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.paused_until).toEqual(new Date(now.getTime() + OWNER_PAUSE_MS))
    expect(chat.pause_reason).toBe('owner_replied')
  })

  it('el echo con el celular sin el 9 (54… en vez de 549…) pausa el mismo chat', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()

    await ingestWhatsappEvents([ownerEvent(s, { to: `54${s.phone.slice(3)}` })], now)

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.pause_reason).toBe('owner_replied')
    expect(chat.paused_until).toEqual(new Date(now.getTime() + OWNER_PAUSE_MS))
  })

  it('con el chat ya pausado por más tiempo: guarda el mensaje pero no le acorta la pausa', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const handoffUntil = new Date(now.getTime() + 12 * HOUR_MS)
    await pauseChat(chatId, handoffUntil, 'handoff_other')

    await ingestWhatsappEvents([ownerEvent(s)], now)

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.paused_until).toEqual(handoffUntil)
    expect(chat.pause_reason).toBe('handoff_other')
    expect(await readMessages(s.tenantId, chatId)).toHaveLength(1)
  })

  it('con el chat pausado por menos tiempo: extiende la pausa a 6 h', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await pauseChat(chatId, new Date(now.getTime() + 30 * MINUTE_MS), 'bot_error')

    await ingestWhatsappEvents([ownerEvent(s)], now)

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.paused_until).toEqual(new Date(now.getTime() + OWNER_PAUSE_MS))
    expect(chat.pause_reason).toBe('owner_replied')
  })
})

// ─── processWhatsappTurn ─────────────────────────────────────────────────────

describe('processWhatsappTurn — respuesta', () => {
  it('con un pendiente más viejo que la última respuesta del bot, el historial termina en el user pendiente', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    // M1 ya contestado; M2 llegó antes de R1 pero R1 no lo vio (sigue pendiente).
    const m1 = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 50 * MINUTE_MS),
      processedAt: ago(now, 49 * MINUTE_MS),
    })
    const m2 = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: '¿cuánto sale el turno?',
      createdAt: ago(now, 40 * MINUTE_MS),
    })
    await seedMessage(s, chatId, {
      direction: 'outbound',
      body: '¡Hola! ¿En qué te ayudo?',
      createdAt: ago(now, 30 * MINUTE_MS),
    })
    vi.mocked(runAgent).mockResolvedValue(agentResult('El turno sale $20.000'))
    const sentId = waId('out')
    vi.mocked(sendWhatsappText).mockResolvedValue({ waMessageId: sentId })

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('replied')
    expect(runAgent).toHaveBeenCalledTimes(1)
    const { history } = vi.mocked(runAgent).mock.calls[0]![0]
    expect(history).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
      { role: 'user', content: '¿cuánto sale el turno?' },
    ])
    expect(history.at(-1)?.role).toBe('user')

    expect(sendWhatsappText).toHaveBeenCalledTimes(1)
    expect(sendWhatsappText).toHaveBeenCalledWith({
      phoneNumberId: s.phoneNumberId,
      to: s.phone,
      body: 'El turno sale $20.000',
    })

    const messages = await readMessages(s.tenantId, chatId)
    const sent = messages.find((m) => m.wa_message_id === sentId)
    expect(sent).toMatchObject({
      direction: 'outbound',
      body: 'El turno sale $20.000',
      input_tokens: 120,
      cached_tokens: 80,
      output_tokens: 30,
    })
    expect(byId(messages, m2).processed_at).toEqual(now)
    // M1 ya estaba procesado: el turno no le pisa la fecha.
    expect(byId(messages, m1).processed_at).toEqual(ago(now, 49 * MINUTE_MS))
    expect((await readChat(s.tenantId, chatId)).paused_until).toBeNull()
    expect(notifyAdminPush).not.toHaveBeenCalled()
  })

  it('el contexto lleva el precio de cada franja y solo las reservas vigentes de ESTE chat', async () => {
    const sql = adminSql()
    const s = await seed()
    const chatId = await addChat(s)
    const otherChatId = await insertWhatsappChat(sql, {
      tenantId: s.tenantId,
      waPhone: randomPhone(),
    })
    const courtId = await insertCourt(sql, s.tenantId)
    const rules = [
      { days: [...DAY_KEYS], from: '00:00', to: '18:00', price: 2_800_000 },
      { days: [...DAY_KEYS], from: '18:00', to: '00:00', price: 3_500_000 },
    ]
    await sql`UPDATE courts SET name = 'Cancha Uno', pricing = ${sql.json({ rules })} WHERE id = ${courtId}`
    const mine = await insertBooking(sql, {
      tenantId: s.tenantId,
      courtId,
      timeStart: '21:00',
      timeEnd: '22:00',
      status: 'confirmed',
    })
    const other = await insertBooking(sql, {
      tenantId: s.tenantId,
      courtId,
      timeStart: '19:00',
      timeEnd: '20:00',
      status: 'confirmed',
    })
    await sql`UPDATE bookings SET whatsapp_chat_id = ${chatId} WHERE id = ${mine}`
    await sql`UPDATE bookings SET whatsapp_chat_id = ${otherChatId} WHERE id = ${other}`
    const now = new Date()
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: '¿cuánto sale a la noche?',
      createdAt: ago(now, MINUTE_MS),
    })

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('replied')

    const { complexContext } = vi.mocked(runAgent).mock.calls[0]![0]
    // Con solo el "desde", el bot no sabía cuánto sale la noche y lo inventaba.
    expect(complexContext).toMatch(/- Cancha Uno \(.*\)\. Precio del turno:/)
    expect(complexContext).toMatch(/de 00:00 a 18:00: \$\s*28\.000/)
    expect(complexContext).toMatch(/de 18:00 a 00:00: \$\s*35\.000/)
    expect(complexContext).toContain('a las 21:00, Cancha Uno: confirmada, se paga en el complejo')
    expect(complexContext).not.toContain('a las 19:00')
  })

  it('un entrante que llega mientras corre el modelo queda sin procesar para el próximo turno', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const read = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 5 * MINUTE_MS),
    })
    // El jugador escribe otra vez MIENTRAS el modelo "piensa": entra por la ingesta real.
    vi.mocked(runAgent).mockImplementationOnce(async () => {
      const late = await ingestWhatsappEvents(
        [inboundEvent(s, { text: 'una cosa más' })],
        new Date(),
      )
      expect(late.chatsToProcess).toEqual([{ tenantId: s.tenantId, chatId }])
      return agentResult('Respuesta al primer mensaje')
    })

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('replied')
    const messages = await readMessages(s.tenantId, chatId)
    expect(byId(messages, read).processed_at).toEqual(now)
    const late = messages.find((m) => m.body === 'una cosa más')
    expect(late, 'el mensaje tardío tiene que estar guardado').toBeDefined()
    expect(late!.processed_at).toBeNull()

    // El próximo job lo recoge: el historial termina en lo último que dijo el jugador.
    vi.mocked(runAgent).mockClear()
    const next = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, new Date())
    expect(next).toBe('replied')
    const { history } = vi.mocked(runAgent).mock.calls[0]![0]
    expect(history.at(-1)).toEqual({ role: 'user', content: 'una cosa más' })
  })

  it('si el dueño contesta mientras corre el modelo, la respuesta del bot no sale', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const pending = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, MINUTE_MS),
    })
    vi.mocked(runAgent).mockImplementationOnce(async () => {
      await ingestWhatsappEvents([ownerEvent(s)], new Date())
      return agentResult('Respuesta del bot')
    })

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('paused')
    expect(sendWhatsappText).not.toHaveBeenCalled()
    const messages = await readMessages(s.tenantId, chatId)
    expect(byId(messages, pending).processed_at).toEqual(now)
    expect(messages.filter((m) => m.direction === 'outbound')).toEqual([])
  })

  it('si el dueño contesta mientras corre el modelo pero el turno intentó reservar, sale igual', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'reservame la de las 21 a nombre de Juan',
      createdAt: ago(now, MINUTE_MS),
    })
    vi.mocked(runAgent).mockImplementationOnce(async () => {
      await ingestWhatsappEvents([ownerEvent(s)], new Date())
      return { ...agentResult('Listo, quedó reservado'), toolsCalled: ['reservar'] }
    })

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('replied')
    expect(sendWhatsappText).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Listo, quedó reservado' }),
    )
  })

  it('las herramientas de un turno se guardan y el turno siguiente las vuelve a ver', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: '¿hay a las 21?',
      createdAt: ago(now, 5 * MINUTE_MS),
    })
    const trace: AgentResult['trace'] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'ver_disponibilidad',
            input: { fecha: '2026-10-23' },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"canchas":[]}' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'A las 21 no hay' }] },
    ]
    vi.mocked(runAgent).mockResolvedValueOnce(agentResult('A las 21 no hay', trace))
    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('replied')

    const storedTrace = async () =>
      (
        await adminSql()<{ tool_trace: unknown }[]>`
          SELECT tool_trace FROM whatsapp_messages
          WHERE chat_id = ${chatId} AND direction = 'outbound' ORDER BY created_at
        `
      ).map((r) => r.tool_trace)
    // Vuelve como arreglo, no como string con el JSON adentro (doble stringify).
    expect(await storedTrace()).toEqual([trace])

    await ingestWhatsappEvents([inboundEvent(s, { text: '¿y a las 22?' })], new Date())
    vi.mocked(runAgent).mockClear()
    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, new Date())).toBe('replied')

    const { history } = vi.mocked(runAgent).mock.calls[0]![0]
    expect(history).toEqual([
      { role: 'user', content: '¿hay a las 21?' },
      ...trace,
      { role: 'user', content: '¿y a las 22?' },
    ])
    // La segunda respuesta no usó herramientas: no guarda trace.
    expect(await storedTrace()).toEqual([trace, null])
  })
})

describe('processWhatsappTurn — fallas', () => {
  it('si Kapso no entrega: handed_off_on_error, pendientes procesados (sin loop), pausa de 30 min y push', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const pending = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 5 * MINUTE_MS),
    })
    const kapsoError = new Error('Kapso respondió 500')
    vi.mocked(sendWhatsappText).mockRejectedValue(kapsoError)

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('handed_off_on_error')
    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(sendWhatsappText).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(kapsoError)

    const messages = await readMessages(s.tenantId, chatId)
    // No hay respuesta guardada (nunca se entregó) y el pendiente no se reprocesa.
    expect(messages.filter((m) => m.direction === 'outbound')).toHaveLength(0)
    expect(byId(messages, pending).processed_at).toEqual(now)

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.paused_until).toEqual(new Date(now.getTime() + BOT_ERROR_PAUSE_MS))
    expect(chat.pause_reason).toBe('bot_error')

    expect(notifyAdminPush).toHaveBeenCalledTimes(1)
    expect(notifyAdminPush).toHaveBeenCalledWith(s.tenantId, {
      type: 'whatsapp_handoff',
      summaryLabel: expect.any(String),
      url: '/settings/whatsapp',
    })

    // Un nuevo job para el mismo chat (el rescate) no vuelve a llamar al modelo.
    vi.mocked(runAgent).mockClear()
    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('nothing_pending')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('si el modelo falla: manda el texto de fallback, handed_off_on_error y pausa de 30 min', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const pending = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 5 * MINUTE_MS),
    })
    const modelError = new Error('modelo caído')
    vi.mocked(runAgent).mockRejectedValue(modelError)

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('handed_off_on_error')
    expect(captureException).toHaveBeenCalledWith(modelError)
    expect(sendWhatsappText).toHaveBeenCalledTimes(1)
    expect(sendWhatsappText).toHaveBeenCalledWith({
      phoneNumberId: s.phoneNumberId,
      to: s.phone,
      body: expect.stringContaining('no puedo responderte'),
    })

    const messages = await readMessages(s.tenantId, chatId)
    const fallback = messages.find((m) => m.direction === 'outbound')
    expect(fallback?.body).toContain('no puedo responderte')
    // El fallback no vino del modelo: sin tokens que contar.
    expect(fallback).toMatchObject({ input_tokens: null, cached_tokens: null, output_tokens: null })
    expect(byId(messages, pending).processed_at).toEqual(now)

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.paused_until).toEqual(new Date(now.getTime() + BOT_ERROR_PAUSE_MS))
    expect(chat.pause_reason).toBe('bot_error')
    expect(notifyAdminPush).toHaveBeenCalledTimes(1)
  })

  // Si el modelo ya pasó el chat a humano (12 h, tool `pasar_a_humano`) y después el envío falla,
  // la pausa de 30 min de `bot_error` no puede acortarla: a la media hora el bot volvería a
  // contestar un chat que debía atender una persona. `pauseChatForHuman` usa GREATEST, como el eco.
  it('un pase a humano de 12 h no se acorta si el envío falla después', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'está lloviendo, ¿se juega?',
      createdAt: ago(now, MINUTE_MS),
    })
    // El modelo llama a la tool REAL `pasar_a_humano` (pausa 12 h) y después Kapso no entrega.
    vi.mocked(runAgent).mockImplementationOnce(async ({ tools }) => {
      await tools.find((t) => t.definition.name === 'pasar_a_humano')!.run({ motivo: 'lluvia' })
      return agentResult('Le aviso a alguien del complejo')
    })
    vi.mocked(sendWhatsappText).mockRejectedValue(new Error('Kapso respondió 500'))

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe(
      'handed_off_on_error',
    )

    const chat = await readChat(s.tenantId, chatId)
    expect(chat.paused_until!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 12 * HOUR_MS)
  })
})

describe('processWhatsappTurn — cortes sin llamar al modelo', () => {
  it('chat pausado: paused y marca el pendiente como procesado', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const until = new Date(now.getTime() + HOUR_MS)
    await pauseChat(chatId, until, 'handoff_other')
    const pending = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, MINUTE_MS),
    })

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('paused')
    expect(runAgent).not.toHaveBeenCalled()
    expect(sendWhatsappText).not.toHaveBeenCalled()
    expect(byId(await readMessages(s.tenantId, chatId), pending).processed_at).toEqual(now)
    expect((await readChat(s.tenantId, chatId)).paused_until).toEqual(until)
  })

  it('pausa ya vencida: el bot vuelve a contestar', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await pauseChat(chatId, ago(now, MINUTE_MS), 'owner_replied')
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 30_000),
    })

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('replied')
    expect(runAgent).toHaveBeenCalledTimes(1)
  })

  it('sin pendientes: nothing_pending y no llama al modelo', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 10 * MINUTE_MS),
      processedAt: ago(now, 9 * MINUTE_MS),
    })

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('nothing_pending')
    // Un chat que no existe (purgado entre el encolado y el turno) tampoco hace nada.
    expect(
      await processWhatsappTurn({ tenantId: s.tenantId, chatId: faker.string.uuid() }, now),
    ).toBe('nothing_pending')
    expect(runAgent).not.toHaveBeenCalled()
    expect(sendWhatsappText).not.toHaveBeenCalled()
  })

  it('conexión apagada al momento del turno: disabled y marca el pendiente como procesado', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    const pending = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, MINUTE_MS),
    })
    await setConnectionEnabled(s.tenantId, false)

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('disabled')
    expect(runAgent).not.toHaveBeenCalled()
    expect(sendWhatsappText).not.toHaveBeenCalled()
    expect(byId(await readMessages(s.tenantId, chatId), pending).processed_at).toEqual(now)
  })
})

describe('processWhatsappTurn — tope de respuestas por hora', () => {
  /** `count` salientes del bot repartidos desde `firstMinutesAgo` hacia atrás, de a un minuto. */
  async function seedReplies(
    s: Seed,
    chatId: string,
    now: Date,
    count: number,
    firstMinutesAgo: number,
  ) {
    for (let i = 0; i < count; i++) {
      await seedMessage(s, chatId, {
        direction: 'outbound',
        body: `respuesta ${i}`,
        createdAt: ago(now, (firstMinutesAgo + i) * MINUTE_MS),
      })
    }
  }

  it('con 30 salientes en la última hora: rate_limited, marca procesado y no llama al modelo', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedReplies(s, chatId, now, 30, 1)
    const pending = await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 30_000),
    })

    const outcome = await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)

    expect(outcome).toBe('rate_limited')
    expect(runAgent).not.toHaveBeenCalled()
    expect(sendWhatsappText).not.toHaveBeenCalled()
    expect(byId(await readMessages(s.tenantId, chatId), pending).processed_at).toEqual(now)
  })

  it('con 29 salientes en la última hora: todavía contesta', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedReplies(s, chatId, now, 29, 1)
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 30_000),
    })

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('replied')
    expect(runAgent).toHaveBeenCalledTimes(1)
  })

  it('30 salientes de hace más de una hora no cuentan para el tope', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedReplies(s, chatId, now, 30, 61)
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, 30_000),
    })

    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('replied')
    expect(runAgent).toHaveBeenCalledTimes(1)
  })
})

// ─── P8: el bot se calla cuando el complejo no está al día ──────────────────

describe('el bot según el estado del complejo (TurnoGol Plus, P8)', () => {
  /**
   * Pone al complejo en `status`. Para `canceled` deja una suscripción con el
   * fin de período que se pida: es lo único que decide si todavía pagó el mes.
   */
  async function setTenantStatus(
    tenantId: string,
    status: string,
    periodEnd: Date | null = null,
  ): Promise<void> {
    const sql = adminSql()
    await sql`UPDATE tenants SET status = ${status}::tenant_status WHERE id = ${tenantId}`
    if (periodEnd) {
      const [plan] = await sql<{ id: string }[]>`
        SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
      `
      await sql`
        INSERT INTO tenant_subscriptions (
          tenant_id, plan_id, billing_cycle, billed_courts, status,
          current_period_start, current_period_end
        ) VALUES (
          ${tenantId}, ${plan!.id}, 'monthly', 1, 'canceled'::subscription_status,
          ${new Date(periodEnd.getTime() - 30 * 86_400_000)}, ${periodEnd}
        )
      `
    }
  }

  const SILENT = ['suspended', 'blocked', 'churned'] as const

  it.each(SILENT)('ingesta: en %s no guarda nada y cuenta el evento en botOff', async (status) => {
    const s = await seed()
    await setTenantStatus(s.tenantId, status)

    const res = await ingestWhatsappEvents([inboundEvent(s)], new Date())

    expect(res).toEqual({ chatsToProcess: [], unknownNumbers: 0, botOff: 1 })
    expect(await countRows(s.tenantId)).toEqual({ chats: 0, messages: 0 })
  })

  it.each(SILENT)(
    'turno: en %s no llama al modelo ni envía, y marca el pendiente',
    async (status) => {
      const s = await seed()
      const chatId = await addChat(s)
      const now = new Date()
      const pending = await seedMessage(s, chatId, {
        direction: 'inbound',
        body: 'hola',
        createdAt: ago(now, MINUTE_MS),
      })
      await setTenantStatus(s.tenantId, status)

      expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('disabled')
      expect(runAgent).not.toHaveBeenCalled()
      expect(sendWhatsappText).not.toHaveBeenCalled()
      expect(byId(await readMessages(s.tenantId, chatId), pending).processed_at).toEqual(now)
    },
  )

  it('canceled con el período VENCIDO también se calla (ingesta y turno)', async () => {
    const s = await seed()
    const chatId = await addChat(s)
    const now = new Date()
    await seedMessage(s, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, MINUTE_MS),
    })
    await setTenantStatus(s.tenantId, 'canceled', ago(now, 24 * HOUR_MS))

    expect((await ingestWhatsappEvents([inboundEvent(s)], now)).botOff).toBe(1)
    expect(await processWhatsappTurn({ tenantId: s.tenantId, chatId }, now)).toBe('disabled')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('controles positivos: past_due y canceled con el período vigente SIGUEN contestando', async () => {
    const pastDue = await seed()
    await setTenantStatus(pastDue.tenantId, 'past_due')
    const resPastDue = await ingestWhatsappEvents([inboundEvent(pastDue)], new Date())
    expect(resPastDue.botOff).toBe(0)
    expect(resPastDue.chatsToProcess).toHaveLength(1)

    const canceled = await seed()
    const chatId = await addChat(canceled)
    const now = new Date()
    await seedMessage(canceled, chatId, {
      direction: 'inbound',
      body: 'hola',
      createdAt: ago(now, MINUTE_MS),
    })
    await setTenantStatus(canceled.tenantId, 'canceled', new Date(now.getTime() + 5 * 86_400_000))
    expect(await processWhatsappTurn({ tenantId: canceled.tenantId, chatId }, now)).toBe('replied')
    expect(runAgent).toHaveBeenCalledTimes(1)
  })
})
