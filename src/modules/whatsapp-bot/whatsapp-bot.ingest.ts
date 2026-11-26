import { and, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm'
import { getWorkerDb, withTenantContext } from '@/shared/db/client'
import { whatsappChats, whatsappConnections, whatsappMessages } from '@/shared/db/schema'
import type { NormalizedWhatsappEvent } from '@/lib/kapso/events.schema'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { logger } from '@/shared/lib/logger'
import { BOT_FEATURE_FLAG, isBotTenantOpen } from './whatsapp-bot.connection'

/**
 * Ingesta de eventos de WhatsApp: guarda el mensaje y decide si hay que
 * despertar al bot. Corre en el route handler del webhook, que tiene que
 * contestar en menos de 10 s: acá no se llama al modelo ni a Kapso.
 *
 * Minimización (Ley 25.326): con el asistente apagado no se guarda NADA; y el
 * texto que el dueño escribe desde su celular solo se registra en chats donde
 * el jugador ya escribió. Si el dueño abre la charla, del número queda el
 * teléfono y la pausa, sin nombre ni texto (decisión del 2026-10-29).
 */

/** Cuánto se calla el bot en un chat después de que el dueño contestó a mano. */
const OWNER_REPLY_PAUSE_MS = 6 * 60 * 60 * 1000
const AUTO_REPLY_MIN_LEN = 40
const AUTO_REPLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const AUTO_REPLY_REPEAT_CHATS = 2

function normalizeReplyText(text: string | null): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function isKnownBusinessAutoReply(text: string | null): boolean {
  const norm = normalizeReplyText(text)
  if (!norm) return false
  return (
    norm.includes('gracias por escribirnos') &&
    (norm.includes('estamos probando nueva plataforma') || norm.includes('turnogol.app/'))
  )
}

export type IngestResult = {
  /** Chats con mensajes nuevos del jugador: hay que encolar un turno del bot. */
  chatsToProcess: { tenantId: string; chatId: string }[]
  /** Eventos de un número que no está conectado a ningún complejo. */
  unknownNumbers: number
  /** Eventos descartados porque el asistente del complejo está apagado. */
  botOff: number
}

/**
 * Resuelve el complejo por `phone_number_id`. Va por el pool worker porque
 * todavía no hay contexto de tenant: bajo RLS, el pool de la app devolvería
 * cero filas sin error.
 */
async function connectionsByPhoneNumberId(
  ids: string[],
  now: Date,
): Promise<Map<string, { tenantId: string; live: boolean }>> {
  if (ids.length === 0) return new Map()
  const rows = await getWorkerDb()
    .select({
      phoneNumberId: whatsappConnections.phoneNumberId,
      tenantId: whatsappConnections.tenantId,
      enabled: whatsappConnections.enabled,
      status: whatsappConnections.status,
    })
    .from(whatsappConnections)
    .where(inArray(whatsappConnections.phoneNumberId, ids))
  return new Map(
    await Promise.all(
      rows.map(
        async (r) =>
          [
            r.phoneNumberId,
            {
              tenantId: r.tenantId,
              live:
                r.enabled &&
                r.status === 'connected' &&
                (await isFeatureEnabled(BOT_FEATURE_FLAG, r.tenantId)) &&
                (await isBotTenantOpen(r.tenantId, now)),
            },
          ] as const,
      ),
    ),
  )
}

export async function ingestWhatsappEvents(
  events: NormalizedWhatsappEvent[],
  now: Date = new Date(),
): Promise<IngestResult> {
  const relevant = events.filter(
    (e): e is Exclude<NormalizedWhatsappEvent, { kind: 'ignored' }> => e.kind !== 'ignored',
  )
  const connections = await connectionsByPhoneNumberId(
    [...new Set(relevant.map((e) => e.phoneNumberId))],
    now,
  )

  const toProcess = new Map<string, { tenantId: string; chatId: string }>()
  let unknownNumbers = 0
  let botOff = 0

  for (const event of relevant) {
    const connection = connections.get(event.phoneNumberId)
    if (!connection) {
      unknownNumbers++
      continue
    }
    if (!connection.live) {
      botOff++
      continue
    }
    const { tenantId } = connection

    if (event.kind === 'owner') {
      await recordOwnerReply(tenantId, event, now)
      continue
    }

    await withTenantContext(tenantId, async (tx) => {
      const [chat] = await tx
        .insert(whatsappChats)
        .values({
          tenantId,
          // Misma forma que el chat que abre el dueño: si no, el jugador caería en otro.
          waPhone: inboundForm(event.from),
          displayName: event.contactName,
          lastInboundAt: now,
        })
        .onConflictDoUpdate({
          target: [whatsappChats.tenantId, whatsappChats.waPhone],
          set: {
            lastInboundAt: now,
            // Solo pisa el nombre si vino uno: un evento sin perfil no lo borra.
            displayName: sql`COALESCE(${event.contactName}, ${whatsappChats.displayName})`,
          },
        })
        .returning({ id: whatsappChats.id, pausedUntil: whatsappChats.pausedUntil })
      if (!chat) return
      const paused = !!chat.pausedUntil && chat.pausedUntil > now

      const inserted = await tx
        .insert(whatsappMessages)
        .values({
          tenantId,
          chatId: chat.id,
          direction: 'inbound',
          waMessageId: event.waMessageId,
          kind: event.messageKind,
          body: event.text,
          processedAt: paused ? now : null,
        })
        .onConflictDoNothing({ target: whatsappMessages.waMessageId })
        .returning({ id: whatsappMessages.id })
      // Reintento del webhook: el mensaje ya estaba, no se reprocesa nada.
      if (inserted.length === 0 || paused) return

      toProcess.set(chat.id, { tenantId, chatId: chat.id })
    })
  }

  return { chatsToProcess: [...toProcess.values()], unknownNumbers, botOff }
}

/**
 * Un celular argentino puede venir como 549… (así llega el entrante) o como
 * 54… sin el 9. No está confirmado cómo trae Kapso el destinatario del echo,
 * así que se buscan las dos formas.
 */
function sameMobile(phone: string): string[] {
  if (phone.startsWith('549')) return [phone, `54${phone.slice(3)}`]
  if (phone.startsWith('54')) return [phone, `549${phone.slice(2)}`]
  return [phone]
}

/** Un celular argentino sin el 9 pasa a la forma en que llega el entrante. */
function inboundForm(phone: string): string {
  return phone.length === 12 && phone.startsWith('54') && !phone.startsWith('549')
    ? `549${phone.slice(2)}`
    : phone
}

/**
 * El dueño escribió desde su celular: el bot se calla en ese chat.
 *
 * Si el número nunca le escribió al asistente (el dueño abrió la charla), el
 * chat se crea igual, pausado: si el jugador contesta, el bot no se mete en una
 * charla que no vio. Su `last_inbound_at` queda en la creación, así la purga de
 * 30 días lo borra. Lo que escribe el dueño se guarda solo después de que el
 * jugador escribió.
 */
async function recordOwnerReply(
  tenantId: string,
  event: Extract<NormalizedWhatsappEvent, { kind: 'owner' }>,
  now: Date,
): Promise<void> {
  if (isKnownBusinessAutoReply(event.text)) {
    logger.info('whatsapp-bot: auto-respuesta de WhatsApp Business ignorada', {
      module: 'whatsapp-bot',
      tenantId,
    })
    return
  }
  const pauseEnd = new Date((event.sentAtMs ?? now.getTime()) + OWNER_REPLY_PAUSE_MS)
  if (pauseEnd <= now) return
  const normText = normalizeReplyText(event.text)
  await withTenantContext(tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: whatsappChats.id })
      .from(whatsappChats)
      .where(
        and(
          eq(whatsappChats.tenantId, tenantId),
          inArray(whatsappChats.waPhone, sameMobile(event.to)),
        ),
      )
      .limit(1)

    if (normText.length >= AUTO_REPLY_MIN_LEN) {
      const windowStart = new Date(now.getTime() - AUTO_REPLY_WINDOW_MS)
      const [repeatRow] = (await tx
        .select({ n: sql<number>`COUNT(DISTINCT ${whatsappMessages.chatId})::int` })
        .from(whatsappMessages)
        .where(
          and(
            eq(whatsappMessages.tenantId, tenantId),
            eq(whatsappMessages.direction, 'owner'),
            gte(whatsappMessages.createdAt, windowStart),
            ...(existing ? [ne(whatsappMessages.chatId, existing.id)] : []),
            sql`regexp_replace(lower(trim(${whatsappMessages.body})), '[[:space:]]+', ' ', 'g') = ${normText}`,
          ),
        )) as Array<{ n: number }>
      if ((repeatRow?.n ?? 0) >= AUTO_REPLY_REPEAT_CHATS) {
        logger.info('whatsapp-bot: auto-respuesta repetida de WhatsApp Business ignorada', {
          module: 'whatsapp-bot',
          tenantId,
        })
        return
      }
    }

    const [chat] = existing
      ? [existing]
      : await tx
          .insert(whatsappChats)
          .values({ tenantId, waPhone: inboundForm(event.to) })
          // Carrera con un entrante del mismo número: no pisa nada, solo trae el id.
          .onConflictDoUpdate({
            target: [whatsappChats.tenantId, whatsappChats.waPhone],
            set: { waPhone: sql`excluded.wa_phone` },
          })
          .returning({ id: whatsappChats.id })
    if (!chat) return

    const [playerWrote] = await tx
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.chatId, chat.id),
          eq(whatsappMessages.direction, 'inbound'),
        ),
      )
      .limit(1)
    if (playerWrote) {
      const inserted = await tx
        .insert(whatsappMessages)
        .values({
          tenantId,
          chatId: chat.id,
          direction: 'owner',
          waMessageId: event.waMessageId,
          kind: 'text',
          body: event.text,
          // El echo del dueño no lo consume ningún turno.
          processedAt: now,
        })
        .onConflictDoNothing({ target: whatsappMessages.waMessageId })
        .returning({ id: whatsappMessages.id })
      if (inserted.length === 0) return
    }

    // GREATEST: si el chat ya estaba pausado más tiempo (pase a humano, pausa
    // manual), contestar a mano no le acorta la pausa, pero deja trazabilidad de `'owner_replied'`.
    const until = sql`${pauseEnd.toISOString()}::timestamptz`
    await tx
      .update(whatsappChats)
      .set({
        pausedUntil: sql`GREATEST(COALESCE(${whatsappChats.pausedUntil}, ${until}), ${until})`,
        pauseReason: 'owner_replied',
      })
      .where(and(eq(whatsappChats.id, chat.id), eq(whatsappChats.tenantId, tenantId)))
    // Un worker demorado tampoco debe contestar mañana lo que el dueño ya tomó hoy.
    await tx
      .update(whatsappMessages)
      .set({ processedAt: now })
      .where(
        and(
          eq(whatsappMessages.tenantId, tenantId),
          eq(whatsappMessages.chatId, chat.id),
          eq(whatsappMessages.direction, 'inbound'),
          isNull(whatsappMessages.processedAt),
        ),
      )
  })
}
