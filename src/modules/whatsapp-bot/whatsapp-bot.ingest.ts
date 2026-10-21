import { and, eq, inArray, sql } from 'drizzle-orm'
import { getWorkerDb, withTenantContext } from '@/shared/db/client'
import { whatsappChats, whatsappConnections, whatsappMessages } from '@/shared/db/schema'
import type { NormalizedWhatsappEvent } from '@/lib/kapso/events.schema'
import { isFeatureEnabled } from '@/shared/feature-flags'
import { BOT_FEATURE_FLAG } from './whatsapp-bot.connection'

/**
 * Ingesta de eventos de WhatsApp: guarda el mensaje y decide si hay que
 * despertar al bot. Corre en el route handler del webhook, que tiene que
 * contestar en menos de 10 s: acá no se llama al modelo ni a Kapso.
 *
 * Minimización (Ley 25.326): con el asistente apagado no se guarda NADA; y el
 * eco de lo que el dueño escribe desde su celular solo se registra en chats
 * donde el jugador ya le habló al asistente — nunca crea un chat para un
 * proveedor o un familiar al que el dueño le escribe.
 */

/** Cuánto se calla el bot en un chat después de que el dueño contestó a mano. */
const OWNER_REPLY_PAUSE_MS = 4 * 60 * 60 * 1000

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
                (await isFeatureEnabled(BOT_FEATURE_FLAG, r.tenantId)),
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
  const connections = await connectionsByPhoneNumberId([
    ...new Set(relevant.map((e) => e.phoneNumberId)),
  ])

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
          waPhone: event.from,
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
        .returning({ id: whatsappChats.id })
      if (!chat) return

      const inserted = await tx
        .insert(whatsappMessages)
        .values({
          tenantId,
          chatId: chat.id,
          direction: 'inbound',
          waMessageId: event.waMessageId,
          kind: event.messageKind,
          body: event.text,
        })
        .onConflictDoNothing({ target: whatsappMessages.waMessageId })
        .returning({ id: whatsappMessages.id })
      // Reintento del webhook: el mensaje ya estaba, no se reprocesa nada.
      if (inserted.length === 0) return

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

/**
 * El dueño contestó desde su celular: el bot se calla en ese chat. Solo si el
 * chat ya existe (el jugador le habló al asistente); a cualquier otro número
 * no se le guarda nada.
 */
async function recordOwnerReply(
  tenantId: string,
  event: Extract<NormalizedWhatsappEvent, { kind: 'owner' }>,
  now: Date,
): Promise<void> {
  await withTenantContext(tenantId, async (tx) => {
    const [chat] = await tx
      .select({ id: whatsappChats.id })
      .from(whatsappChats)
      .where(
        and(
          eq(whatsappChats.tenantId, tenantId),
          inArray(whatsappChats.waPhone, sameMobile(event.to)),
        ),
      )
      .limit(1)
    if (!chat) return

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

    // GREATEST: si el chat ya estaba pausado más tiempo (pase a humano, pausa
    // manual), contestar a mano no le acorta la pausa.
    const until = sql`${new Date(now.getTime() + OWNER_REPLY_PAUSE_MS).toISOString()}::timestamptz`
    await tx
      .update(whatsappChats)
      .set({
        pausedUntil: sql`GREATEST(COALESCE(${whatsappChats.pausedUntil}, ${until}), ${until})`,
        pauseReason: sql`CASE WHEN ${whatsappChats.pausedUntil} > ${until} THEN ${whatsappChats.pauseReason} ELSE 'owner_replied' END`,
      })
      .where(and(eq(whatsappChats.id, chat.id), eq(whatsappChats.tenantId, tenantId)))
  })
}
