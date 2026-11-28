import type { ResponseInputItem } from 'openai/resources/responses/responses'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { getDb, withTenantContext } from '@/shared/db/client'
import {
  abonados,
  bookings,
  courts,
  players,
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
import { PHONE_HINT_DIGITS } from '@/modules/bookings/guest-late-cancel'
import { suggestionPhoneSql } from '@/modules/relationships/contact-identity'
import { getPublicCourtCards, getPublicTenant } from '@/modules/tenants/public.service'
import { runAgent, type AgentUsage, type OpenAiTracePayload } from './whatsapp-bot.agent'
import {
  buildDynamicTurnContext,
  buildStaticComplexContext,
  type ChatBooking,
} from './whatsapp-bot.prompt'
import { buildBotTools, pauseChatForHuman } from './whatsapp-bot.tools'
import { BOT_FEATURE_FLAG, isBotTenantOpen } from './whatsapp-bot.connection'
import { transcribeUnheardAudios } from './whatsapp-bot.audio'

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
const HISTORY_MAX_MESSAGES = 30
const MAX_REPLIES_PER_HOUR = 30
const ONE_HOUR_MS = 60 * 60 * 1000
const BOT_ERROR_PAUSE_MS = 30 * 60 * 1000

const FALLBACK_REPLY =
  'Perdón, justo no puedo responderte ahora. En un toque te contesto bien por acá.'

const UNHEARD_AUDIO_REPLY =
  'Justo ahora no puedo escuchar audios, me lo escribís en un renglón? Así te lo veo al toque.'

export type TurnOutcome =
  | 'replied'
  | 'handoff'
  | 'silent'
  | 'nothing_pending'
  | 'paused'
  | 'disabled'
  | 'handed_off_on_error'
  | 'rate_limited'

type HistoryRow = {
  direction: 'inbound' | 'outbound' | 'owner'
  kind: 'text' | 'audio' | 'image' | 'interactive' | 'other'
  body: string | null
  createdAt: Date
  toolTrace?: unknown
  pending?: boolean
}

/**
 * Valida trazas del nuevo formato OpenAI Responses API.
 * Las trazas viejas de Anthropic quedan ignoradas y caen limpiamente a `row.body` (cero 400).
 */
function parseOpenAiTrace(value: unknown): ResponseInputItem[] | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<OpenAiTracePayload>
  if (
    v.v !== 1 ||
    v.provider !== 'openai_responses' ||
    !Array.isArray(v.items) ||
    v.items.length === 0
  ) {
    return null
  }
  return v.items
}

/** Etiqueta temporal ART para evitar que el modelo mezcle adjuntos o temas de ayer con hoy. */
function artShortStamp(d: Date, now: Date): string {
  const toArtIso = (x: Date) => new Date(x.getTime() - 3 * 60 * 60 * 1000).toISOString()
  const iso = toArtIso(d)
  const nowDay = toArtIso(now).slice(0, 10)
  const msgDay = iso.slice(0, 10)
  const hhmm = iso.slice(11, 16)
  return msgDay === nowDay ? `hoy ${hhmm}` : `${msgDay.slice(8, 10)}/${msgDay.slice(5, 7)} ${hhmm}`
}

function renderMessage(row: HistoryRow, now: Date): string {
  const stamp = artShortStamp(row.createdAt, now)
  if (row.direction === 'owner') {
    return `[${stamp} | Respondió alguien del complejo]: ${row.body ?? '(sin texto)'}`
  }
  if (row.direction === 'outbound') return row.body ?? ''
  if (row.kind === 'audio') {
    return row.body
      ? `[${stamp} | Audio transcripto]: ${row.body}`
      : `[${stamp} | Mandó un audio que no se pudo transcribir]`
  }
  if (row.kind === 'image') {
    return row.body ? `[${stamp} | Imagen] ${row.body}` : `[${stamp} | Mandó una imagen]`
  }
  return `[${stamp}] ${row.body ?? '[Mensaje sin texto]'}`
}

/**
 * Convierte filas del historial en items de OpenAI Responses API separados en:
 * - `historyBeforePending`: mensajes ya procesados (con su `toolTrace` si es OpenAI v1).
 * - `pendingUserItems`: los mensajes entrantes pendientes agrupados al final.
 */
export function toOpenAiHistory(
  rows: HistoryRow[],
  now: Date,
): { historyBeforePending: ResponseInputItem[]; pendingUserItems: ResponseInputItem[] } {
  const prior = rows.filter((r) => !r.pending)
  const pending = rows.filter((r) => r.pending)

  const historyBeforePending: ResponseInputItem[] = []
  for (const row of prior) {
    if (row.direction === 'outbound') {
      const trace = parseOpenAiTrace(row.toolTrace)
      if (trace) {
        historyBeforePending.push(...trace)
        continue
      }
      if (row.body?.trim()) {
        historyBeforePending.push({ role: 'assistant', content: row.body.trim() })
      }
      continue
    }
    const text = renderMessage(row, now)
    if (!text) continue
    historyBeforePending.push({
      role: row.direction === 'inbound' ? 'user' : 'assistant',
      content: text,
    })
  }

  const pendingLines = pending
    .filter((r) => r.direction === 'inbound')
    .map((r) => renderMessage(r, now))
    .filter(Boolean)

  const pendingUserItems: ResponseInputItem[] =
    pendingLines.length > 0 ? [{ role: 'user', content: pendingLines.join('\n') }] : []

  return { historyBeforePending, pendingUserItems }
}

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

/**
 * Verifica si el dueño intervino manualmente desde su celular mientras corría el modelo.
 * Chequea tanto `pause_reason = 'owner_replied'` como mensajes `direction = 'owner'` nuevos.
 */
async function ownerTookOver(
  tenantId: string,
  chatId: string,
  turnStartedAt: Date,
): Promise<boolean> {
  return withTenantContext(tenantId, async (tx) => {
    const [chat] = await tx
      .select({ pausedUntil: whatsappChats.pausedUntil, pauseReason: whatsappChats.pauseReason })
      .from(whatsappChats)
      .where(and(eq(whatsappChats.tenantId, tenantId), eq(whatsappChats.id, chatId)))
      .limit(1)
    if (
      chat?.pauseReason === 'owner_replied' &&
      !!chat.pausedUntil &&
      chat.pausedUntil > new Date()
    ) {
      return true
    }
    const [recentOwnerMsg] = await tx
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.chatId, chatId),
          eq(whatsappMessages.direction, 'owner'),
          gte(whatsappMessages.createdAt, turnStartedAt),
        ),
      )
      .limit(1)
    return !!recentOwnerMsg
  })
}

async function recordOutbound(params: {
  tenantId: string
  chatId: string
  waMessageId: string
  body: string
  usage?: AgentUsage
  toolTrace?: OpenAiTracePayload | null
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
      toolTrace: params.toolTrace ?? null,
    }),
  )
}

export async function processWhatsappTurn(
  job: { tenantId: string; chatId: string },
  now: Date = new Date(),
): Promise<TurnOutcome> {
  const { tenantId, chatId } = job
  const turnStartedAt = new Date()

  const state = await withTenantContext(tenantId, async (tx) => {
    const [connection] = await tx
      .select({
        phoneNumberId: whatsappConnections.phoneNumberId,
        enabled: whatsappConnections.enabled,
        status: whatsappConnections.status,
        ownerAlertPhone: whatsappConnections.ownerAlertPhone,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.tenantId, tenantId))
      .limit(1)
    const [chat] = await tx
      .select({
        id: whatsappChats.id,
        waPhone: whatsappChats.waPhone,
        displayName: whatsappChats.displayName,
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
        waMessageId: whatsappMessages.waMessageId,
        direction: whatsappMessages.direction,
        kind: whatsappMessages.kind,
        body: whatsappMessages.body,
        toolTrace: whatsappMessages.toolTrace,
        createdAt: whatsappMessages.createdAt,
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

    const hint =
      chat && chat.waPhone.length >= PHONE_HINT_DIGITS
        ? chat.waPhone.slice(-PHONE_HINT_DIGITS)
        : null
    const phoneBookings = hint
      ? await tx
          .select({
            date: sql<string>`to_char(${bookings.date}, 'YYYY-MM-DD')`,
            timeStart: bookings.timeStart,
            courtName: courts.name,
            type: bookings.type,
          })
          .from(bookings)
          .innerJoin(courts, eq(courts.id, bookings.courtId))
          .leftJoin(players, eq(players.id, bookings.playerId))
          .leftJoin(abonados, eq(abonados.id, bookings.abonadoId))
          .where(
            and(
              eq(bookings.tenantId, tenantId),
              or(isNull(bookings.whatsappChatId), ne(bookings.whatsappChatId, chatId)),
              eq(bookings.status, 'confirmed'),
              inArray(bookings.type, ['spontaneous', 'fixed']),
              gt(bookings.endsAt, now),
              or(
                sql`${sql.raw(suggestionPhoneSql('bookings.guest_phone'))} = ${hint}`,
                eq(players.phoneHint8, hint),
                sql`${sql.raw(suggestionPhoneSql('abonados.contact_phone'))} = ${hint}`,
              ),
            ),
          )
          .orderBy(asc(bookings.startsAt))
          .limit(5)
      : []

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
      phoneBookings: phoneBookings.map(({ type, ...b }) => ({ ...b, fixed: type === 'fixed' })),
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

  const unheard = state.history.filter((r) => r.pending && r.kind === 'audio' && !r.body)
  const heard =
    unheard.length > 0
      ? await transcribeUnheardAudios({
          tenantId,
          phoneNumberId: state.connection.phoneNumberId,
          messages: unheard,
        })
      : new Map<string, string>()
  const historyRows = state.history.map((r) => ({ ...r, body: heard.get(r.id) ?? r.body }))

  const { historyBeforePending, pendingUserItems } = toOpenAiHistory(historyRows, now)
  if (pendingUserItems.length === 0) {
    await markProcessed(tenantId, pendingIds, now)
    return 'nothing_pending'
  }

  const phoneNumberId = state.connection.phoneNumberId
  const to = state.chat.waPhone
  const ctx = {
    tenant,
    chatId,
    waPhone: to,
    contactDisplayName: state.chat.displayName,
    phoneNumberId,
    ownerAlertPhone: state.connection.ownerAlertPhone,
    now,
    phoneBookings: state.phoneBookings,
  }

  let reply = FALLBACK_REPLY
  let usage: AgentUsage | undefined
  let toolTrace: OpenAiTracePayload | null = null
  let agentOutcome: 'replied' | 'handoff' | 'silent' = 'replied'
  let failed = false

  const onlyUnheardAudio = historyRows
    .filter((r) => r.pending)
    .every((r) => r.kind === 'audio' && !r.body)

  if (onlyUnheardAudio) {
    reply = UNHEARD_AUDIO_REPLY
  } else {
    try {
      const courtsData = (await getPublicCourtCards(tenant)).map((c) => ({
        ...c,
        priceRules: tenant.hidePrices ? [] : (state.priceRules.get(c.id) ?? []),
      }))
      const result = await runAgent({
        tenantId,
        staticComplexContext: buildStaticComplexContext(tenant, courtsData),
        dynamicTurnContext: buildDynamicTurnContext({
          tenant,
          now,
          contactDisplayName: state.chat.displayName,
          chatBookings: state.chatBookings,
          phoneBookings: state.phoneBookings,
        }),
        historyBeforePending,
        pendingUserItems,
        tools: buildBotTools(ctx, courtsData),
      })

      agentOutcome = result.outcome
      usage = result.usage
      toolTrace = result.trace

      if (result.outcome === 'silent') {
        // Silencio intencional: no se manda nada a Kapso ni se infla `whatsapp_messages`.
        logger.info('whatsapp-bot: turno en silencio (no_responder)', {
          module: 'whatsapp-bot',
          tenantId,
          usage,
          cacheWriteTokens: result.cacheWriteTokens,
        })
        await markProcessed(tenantId, pendingIds, now)
        return 'silent'
      }

      if (result.cacheWriteTokens > 0) {
        logger.info('whatsapp-bot: cache write del turno', {
          module: 'whatsapp-bot',
          tenantId,
          cacheWriteTokens: result.cacheWriteTokens,
        })
      }

      if (!result.text) throw new Error('El modelo no devolvió texto')
      reply = result.text
    } catch (err) {
      failed = true
      captureException(err)
      logger.error('whatsapp-bot: el turno falló, se pasa a una persona', {
        module: 'whatsapp-bot',
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Una reserva ya creada queda visible en la grilla aunque el dueño tome el chat.
  if (await ownerTookOver(tenantId, chatId, turnStartedAt)) {
    await markProcessed(tenantId, pendingIds, now)
    return 'paused'
  }

  let sent: { waMessageId: string } | null = null
  try {
    sent = await sendWhatsappText({ phoneNumberId, to, body: reply })
  } catch (err) {
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
  return agentOutcome === 'handoff' ? 'handoff' : 'replied'
}
