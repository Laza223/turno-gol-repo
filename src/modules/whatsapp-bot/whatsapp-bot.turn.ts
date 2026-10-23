import type Anthropic from '@anthropic-ai/sdk'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, sql } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
import {
  bookings,
  courts,
  tenants,
  whatsappChats,
  whatsappConnections,
  whatsappMessages,
} from '@/shared/db/schema'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'
import { captureException } from '@/lib/sentry'
import { sendWhatsappText } from '@/lib/kapso/client'
import type { CourtPricingData } from '@/modules/courts/court.types'
import { getPublicCourtCards, getPublicTenant } from '@/modules/tenants/public.service'
import { runAgent } from './whatsapp-bot.agent'
import { buildChatBookings, buildComplexContext, type ChatBooking } from './whatsapp-bot.prompt'
import { buildBotTools, pauseChatForHuman } from './whatsapp-bot.tools'
import { BOT_FEATURE_FLAG, isBotTenantOpen } from './whatsapp-bot.connection'

/**
 * Un turno del bot: toma los mensajes pendientes de un chat, corre el agente y
 * contesta. Lo ejecuta el worker de la cola `whatsapp-turn` (Railway), nunca
 * el route handler.
 *
 * Orden de efectos, a propósito:
 * 1. Se leen los pendientes y se marcan como procesados POR ID: lo que llega
 *    mientras corre el modelo queda pendiente para el próximo job (la cola
 *    singleton deja uno esperando), nunca se marca sin haberse leído.
 * 2. Se manda por WhatsApp y RECIÉN DESPUÉS se marcan los mensajes. Si el
 *    proceso muere en el medio, el rescate puede repetir una respuesta (raro y
 *    molesto) en vez de dejar al jugador sin respuesta (peor). `reservar` es
 *    idempotente por chat y turno, así que repetir el turno no duplica reservas.
 * 3. Si el envío falla, NO se reintenta: cada reintento volvería a correr el
 *    modelo (y `reservar` podría generar otro link de pago). Se marca procesado
 *    y el chat pasa a una persona.
 */

/** Historial que ve el modelo: las últimas 24 h, que es también la ventana de WhatsApp. */
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
const HISTORY_MAX_MESSAGES = 30

/**
 * Tope de respuestas del bot por chat y por hora. Una conversación real de
 * reserva son 5-10 idas y vueltas; esto solo frena a quien le escribe en loop
 * para quemar tokens. Se cuenta en la base y no con el rate limiter de
 * Upstash: el worker de Railway no depende de él y la cuenta es exacta.
 */
const MAX_REPLIES_PER_HOUR = 30
const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * Cuánto se calla el bot cuando él mismo falló (modelo caído, Kapso sin
 * entregar). Corto a propósito: un error pasajero no puede dejar mudo el chat
 * todo el día como un pase a humano de verdad (12 h).
 */
const BOT_ERROR_PAUSE_MS = 30 * 60 * 1000

const FALLBACK_REPLY =
  'Perdón, en este momento no puedo responderte. En un rato te contesta alguien del complejo.'

export type TurnOutcome =
  'replied' | 'nothing_pending' | 'paused' | 'disabled' | 'handed_off_on_error' | 'rate_limited'

type HistoryRow = {
  direction: 'inbound' | 'outbound' | 'owner'
  kind: 'text' | 'audio' | 'image' | 'interactive' | 'other'
  body: string | null
  /** Salientes del bot: los mensajes de la API de ese turno (`AgentResult.trace`). */
  toolTrace?: unknown
  /** Entrante que todavía no contestó ningún turno. */
  pending?: boolean
}

function isTraceMessage(value: unknown, role: 'user' | 'assistant'): boolean {
  if (typeof value !== 'object' || value === null) return false
  const m = value as { role?: unknown; content?: unknown }
  return m.role === role && Array.isArray(m.content) && m.content.length > 0
}

/**
 * Lo que vuelve de la columna jsonb: tiene que alternar roles, arrancar en
 * `assistant` y terminar en `assistant` (el texto final). Si no, el mensaje
 * se usa como texto plano: un tool_use sin su tool_result es un 400 de la API.
 */
type TraceMessage = { role: 'user' | 'assistant'; content: Anthropic.ContentBlockParam[] }

function parseTrace(value: unknown): TraceMessage[] | null {
  if (!Array.isArray(value) || value.length % 2 === 0) return null
  const ok = value.every((m: unknown, i) => isTraceMessage(m, i % 2 === 0 ? 'assistant' : 'user'))
  return ok ? (value as TraceMessage[]) : null
}

/** Texto que ve el modelo por cada mensaje guardado. */
function renderMessage(row: HistoryRow): string {
  if (row.direction === 'owner') {
    return `[Respondió una persona del complejo]: ${row.body ?? '(sin texto)'}`
  }
  if (row.direction === 'outbound') return row.body ?? ''
  if (row.kind === 'audio') {
    return row.body
      ? `[Audio, transcripto]: ${row.body}`
      : '[Mandó un audio que no se pudo transcribir]'
  }
  if (row.kind === 'image') return row.body ? `[Imagen] ${row.body}` : '[Mandó una imagen]'
  return row.body ?? '[Mensaje sin texto]'
}

/**
 * Historial como mensajes de la API: entrantes = `user`, salientes y echoes
 * del dueño = `assistant`. Se fusionan los consecutivos del mismo rol y se
 * descarta lo que haya antes del primer mensaje del jugador (la API exige
 * arrancar con `user`).
 *
 * Una respuesta del bot con `toolTrace` entra con sus llamadas a herramientas
 * y lo que devolvieron: así el modelo sabe qué consultó y qué reservó en los
 * turnos anteriores, en vez de ver texto que no sabe de dónde salió.
 *
 * Los PENDIENTES van al final, aunque sean más viejos que la última respuesta:
 * un mensaje que llegó mientras el turno anterior corría, o antes de un aviso
 * de seña, no lo vio esa respuesta. Ordenarlo por fecha dejaba el historial
 * terminando en `assistant` (la API lo toma como prefill o lo rechaza) y el
 * bot no contestaba lo último que preguntó el jugador.
 */
export function toAnthropicHistory(rows: HistoryRow[]): Anthropic.MessageParam[] {
  const ordered = [...rows.filter((r) => !r.pending), ...rows.filter((r) => r.pending)]
  type Part = string | Anthropic.ContentBlockParam
  const out: { role: 'user' | 'assistant'; parts: Part[] }[] = []
  const append = (role: 'user' | 'assistant', parts: Part[]) => {
    const last = out.at(-1)
    if (last && last.role === role) last.parts.push(...parts)
    else out.push({ role, parts: [...parts] })
  }
  for (const row of ordered) {
    const role = row.direction === 'inbound' ? 'user' : 'assistant'
    if (out.length === 0 && role === 'assistant') continue
    const trace = row.direction === 'outbound' ? parseTrace(row.toolTrace) : null
    if (trace) {
      for (const m of trace) append(m.role, m.content)
      continue
    }
    const text = renderMessage(row)
    if (text) append(role, [text])
  }
  return out.map(({ role, parts }) => ({
    role,
    content: parts.every((p): p is string => typeof p === 'string')
      ? parts.join('\n')
      : parts.map((p): Anthropic.ContentBlockParam =>
          typeof p === 'string' ? { type: 'text', text: p } : p,
        ),
  }))
}

/** Marca SOLO los mensajes que este turno leyó: nunca uno que no vio. */
async function markProcessed(tenantId: string, ids: string[], now: Date) {
  if (ids.length === 0) return
  await withTenantContext(tenantId, (tx) =>
    tx
      .update(whatsappMessages)
      .set({ processedAt: now })
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          inArray(whatsappMessages.id, ids),
          isNull(whatsappMessages.processedAt),
        ),
      ),
  )
}

/** El dueño contestó desde su celular y el chat sigue en sus manos. */
async function ownerTookOver(tenantId: string, chatId: string): Promise<boolean> {
  const [chat] = await withTenantContext(tenantId, (tx) =>
    tx
      .select({ pausedUntil: whatsappChats.pausedUntil, pauseReason: whatsappChats.pauseReason })
      .from(whatsappChats)
      .where(and(eq(whatsappChats.tenantId, tenantId), eq(whatsappChats.id, chatId)))
      .limit(1),
  )
  return (
    chat?.pauseReason === 'owner_replied' && !!chat.pausedUntil && chat.pausedUntil > new Date()
  )
}

async function recordOutbound(params: {
  tenantId: string
  chatId: string
  waMessageId: string
  body: string
  usage?: { inputTokens: number; cachedTokens: number; outputTokens: number }
  toolTrace?: Anthropic.MessageParam[]
}) {
  await withTenantContext(params.tenantId, (tx) =>
    tx.insert(whatsappMessages).values({
      tenantId: params.tenantId,
      chatId: params.chatId,
      direction: 'outbound',
      waMessageId: params.waMessageId,
      kind: 'text',
      body: params.body,
      inputTokens: params.usage?.inputTokens ?? null,
      cachedTokens: params.usage?.cachedTokens ?? null,
      outputTokens: params.usage?.outputTokens ?? null,
      toolTrace: params.toolTrace?.length ? params.toolTrace : null,
    }),
  )
}

export async function processWhatsappTurn(
  job: { tenantId: string; chatId: string },
  now: Date = new Date(),
): Promise<TurnOutcome> {
  const { tenantId, chatId } = job

  const state = await withTenantContext(tenantId, async (tx) => {
    const [connection] = await tx
      .select({
        phoneNumberId: whatsappConnections.phoneNumberId,
        enabled: whatsappConnections.enabled,
        status: whatsappConnections.status,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.tenantId, tenantId))
      .limit(1)
    const [chat] = await tx
      .select({
        id: whatsappChats.id,
        waPhone: whatsappChats.waPhone,
        pausedUntil: whatsappChats.pausedUntil,
      })
      .from(whatsappChats)
      .where(and(eq(whatsappChats.id, chatId), eq(whatsappChats.tenantId, tenantId)))
      .limit(1)
    const pending = await tx
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.chatId, chatId),
          eq(whatsappMessages.direction, 'inbound'),
          isNull(whatsappMessages.processedAt),
        ),
      )
    const pendingIds = new Set(pending.map((p) => p.id))
    const history = await tx
      .select({
        id: whatsappMessages.id,
        direction: whatsappMessages.direction,
        kind: whatsappMessages.kind,
        body: whatsappMessages.body,
        toolTrace: whatsappMessages.toolTrace,
      })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.chatId, chatId),
          gte(whatsappMessages.createdAt, new Date(now.getTime() - HISTORY_WINDOW_MS)),
        ),
      )
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(HISTORY_MAX_MESSAGES)
    const [replies] = await tx
      .select({ n: count() })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.chatId, chatId),
          eq(whatsappMessages.direction, 'outbound'),
          gte(whatsappMessages.createdAt, new Date(now.getTime() - ONE_HOUR_MS)),
        ),
      )
    const chatBookings = await tx
      .select({
        date: sql<string>`to_char(${bookings.date}, 'YYYY-MM-DD')`,
        timeStart: bookings.timeStart,
        courtName: courts.name,
        status: bookings.status,
        depositStatus: bookings.depositStatus,
      })
      .from(bookings)
      .innerJoin(courts, eq(courts.id, bookings.courtId))
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          eq(bookings.whatsappChatId, chatId),
          inArray(bookings.status, ['confirmed', 'pending_payment']),
          gt(bookings.endsAt, now),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(5)
    const courtPricing = await tx
      .select({ id: courts.id, pricing: courts.pricing })
      .from(courts)
      .where(and(eq(courts.tenantId, tenantId), eq(courts.status, 'online')))
    return {
      connection,
      chat,
      chatBookings: chatBookings.map((b) => ({
        ...b,
        status: b.status as ChatBooking['status'],
      })),
      priceRules: new Map(
        courtPricing.map((c) => [c.id, (c.pricing as CourtPricingData | null)?.rules ?? []]),
      ),
      pendingIds: [...pendingIds],
      history: history.reverse().map((row) => ({ ...row, pending: pendingIds.has(row.id) })),
      repliesLastHour: replies?.n ?? 0,
    }
  })

  const { pendingIds } = state
  if (!state.chat || pendingIds.length === 0) return 'nothing_pending'

  const live =
    state.connection?.enabled === true &&
    state.connection.status === 'connected' &&
    (await isFeatureEnabled(BOT_FEATURE_FLAG, tenantId)) &&
    (await isBotTenantOpen(tenantId, now))
  if (!live || !state.connection) {
    // Apagado: el mensaje queda para el dueño en su celular. Se marca
    // procesado para que el rescate no lo vuelva a levantar cada minuto.
    await markProcessed(tenantId, pendingIds, now)
    return 'disabled'
  }
  if (state.chat.pausedUntil && state.chat.pausedUntil > now) {
    await markProcessed(tenantId, pendingIds, now)
    return 'paused'
  }
  if (state.repliesLastHour >= MAX_REPLIES_PER_HOUR) {
    logger.warn('whatsapp-bot: chat sobre el tope de respuestas por hora', {
      module: 'whatsapp-bot',
      tenantId,
    })
    await markProcessed(tenantId, pendingIds, now)
    return 'rate_limited'
  }

  const [tenantRow] = await getDb()
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = tenantRow ? await getPublicTenant(tenantRow.slug) : null
  if (!tenant) {
    await markProcessed(tenantId, pendingIds, now)
    return 'disabled'
  }

  const history = toAnthropicHistory(state.history)
  if (history.at(-1)?.role !== 'user') {
    // Los pendientes quedaron fuera de la ventana del historial: no hay nada
    // que el modelo pueda contestar con sentido.
    await markProcessed(tenantId, pendingIds, now)
    return 'nothing_pending'
  }

  const phoneNumberId = state.connection.phoneNumberId
  const to = state.chat.waPhone
  const ctx = { tenant, chatId, waPhone: to, now }

  let reply = FALLBACK_REPLY
  let usage: { inputTokens: number; cachedTokens: number; outputTokens: number } | undefined
  let toolTrace: Anthropic.MessageParam[] = []
  let triedToBook = false
  let failed = false
  try {
    const courts = (await getPublicCourtCards(tenant)).map((c) => ({
      ...c,
      priceRules: tenant.hidePrices ? [] : (state.priceRules.get(c.id) ?? []),
    }))
    const result = await runAgent({
      complexContext: `${buildComplexContext(tenant, courts, now)}\n\n${buildChatBookings(tenant, state.chatBookings)}`,
      history,
      tools: buildBotTools(ctx, courts),
    })
    if (!result.text) throw new Error('El modelo no devolvió texto')
    reply = result.text
    usage = result.usage
    toolTrace = result.trace
    triedToBook = result.toolsCalled.includes('reservar')
  } catch (err) {
    // El modelo o una tool fallaron de verdad: se le avisa al jugador y la
    // charla pasa a una persona en vez de dejarlo hablándole a la nada.
    failed = true
    captureException(err)
    logger.error('whatsapp-bot: el turno falló, se pasa a una persona', {
      module: 'whatsapp-bot',
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // El dueño pudo contestar desde su celular mientras corría el modelo: la del
  // bot sería una segunda respuesta. Sale igual si el turno intentó reservar,
  // porque el jugador tiene que enterarse de lo que quedó hecho.
  if (!triedToBook && (await ownerTookOver(tenantId, chatId))) {
    await markProcessed(tenantId, pendingIds, now)
    return 'paused'
  }

  let sent: { waMessageId: string } | null = null
  try {
    sent = await sendWhatsappText({ phoneNumberId, to, body: reply })
  } catch (err) {
    // Kapso no entregó. Sin reintento (ver arriba): el dueño ve el mensaje en
    // su celular y el push le avisa que lo conteste él.
    failed = true
    captureException(err)
    logger.error('whatsapp-bot: no se pudo mandar la respuesta, se pasa a una persona', {
      module: 'whatsapp-bot',
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  if (sent) {
    try {
      await recordOutbound({
        tenantId,
        chatId,
        waMessageId: sent.waMessageId,
        body: reply,
        usage,
        toolTrace,
      })
    } catch (err) {
      // El jugador SÍ recibió la respuesta: no es una falla de atención, solo
      // falta la fila (contexto del próximo turno y métrica de tokens).
      captureException(err)
      logger.error('whatsapp-bot: la respuesta salió pero no se pudo guardar', {
        module: 'whatsapp-bot',
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await markProcessed(tenantId, pendingIds, now)
  if (failed) {
    await pauseChatForHuman(
      ctx,
      'bot_error',
      'El asistente no pudo responder un mensaje',
      BOT_ERROR_PAUSE_MS,
    )
    return 'handed_off_on_error'
  }
  return 'replied'
}
