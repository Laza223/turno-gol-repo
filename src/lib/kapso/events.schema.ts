import { z } from 'zod'

/**
 * Eventos de WhatsApp de Kapso (webhook `kind: "kapso"`, payload v2), reducidos
 * a lo que el bot necesita. Fuente: docs.kapso.ai › webhooks › message-events.
 *
 * Se eligió el formato de Kapso y no el crudo de Meta (`kind: "meta"`) porque
 * trae dos cosas que el bot usa y Meta no: la transcripción de los audios
 * (`message.kapso.transcript.text`) y el ORIGEN del mensaje
 * (`message.kapso.origin`), que separa al dueño contestando desde su celular
 * (`business_app`) de nuestros propios envíos (`cloud_api`). Al pasar a Tech
 * Provider propio se escribe el parser del formato de Meta y este módulo se
 * reemplaza entero: nada fuera de `src/lib/kapso/` conoce esta forma.
 *
 * Los schemas son permisivos (`.loose()`): Kapso agrega campos sin avisar y un
 * campo nuevo no puede tirar abajo la ingesta.
 */

const messageSchema = z
  .object({
    id: z.string().min(1),
    type: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    text: z.object({ body: z.string() }).loose().optional(),
    image: z.object({ caption: z.string().optional() }).loose().optional(),
    kapso: z
      .object({
        direction: z.string().optional(),
        origin: z.string().optional(),
        transcript: z.object({ text: z.string() }).loose().nullish(),
      })
      .loose()
      .optional(),
  })
  .loose()

const eventSchema = z
  .object({
    phone_number_id: z.string().min(1),
    message: messageSchema,
    conversation: z
      .object({
        contact_name: z.string().nullish(),
        phone_number: z.string().nullish(),
      })
      .loose()
      .optional(),
  })
  .loose()

const batchSchema = z
  .object({
    batch: z.literal(true),
    data: z.array(z.unknown()),
  })
  .loose()

type WhatsappMessageKind = 'text' | 'audio' | 'image' | 'interactive' | 'other'

/** Lo que el bot entiende de un evento. */
export type NormalizedWhatsappEvent =
  | {
      kind: 'inbound'
      phoneNumberId: string
      waMessageId: string
      /** Teléfono del jugador, solo dígitos. */
      from: string
      contactName: string | null
      messageKind: WhatsappMessageKind
      /** Texto, o la transcripción de un audio. `null` si no hay. */
      text: string | null
    }
  | {
      /** El dueño contestó desde su app de WhatsApp Business. */
      kind: 'owner'
      phoneNumberId: string
      waMessageId: string
      /** Teléfono del jugador al que le escribió, solo dígitos. */
      to: string
      text: string | null
    }
  | { kind: 'ignored'; reason: string }

const onlyDigits = (s: string) => s.replace(/\D/g, '')
/** Mismo rango que el CHECK de `whatsapp_chats.wa_phone`: fuera de eso, el INSERT tira. */
const validPhone = (digits: string) => digits.length >= 8 && digits.length <= 15

function kindOf(type: string): WhatsappMessageKind {
  if (type === 'text' || type === 'audio' || type === 'image' || type === 'interactive') return type
  if (type === 'voice') return 'audio'
  return 'other'
}

function normalizeOne(raw: unknown): NormalizedWhatsappEvent {
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) return { kind: 'ignored', reason: 'shape' }
  const { message, phone_number_id: phoneNumberId, conversation } = parsed.data
  const direction = message.kapso?.direction
  const origin = message.kapso?.origin
  const messageKind = kindOf(message.type)
  // Un texto en blanco sería un bloque que la API de Claude rechaza (400).
  const text =
    (message.text?.body ?? message.kapso?.transcript?.text ?? message.image?.caption)?.trim() ||
    null

  // El historial que Meta sincroniza al conectar el número trae mensajes VIEJOS
  // del jugador: contestarlos sería responder charlas de hace semanas.
  if (origin === 'history_sync') return { kind: 'ignored', reason: 'history_sync' }

  if (direction === 'inbound') {
    const from = onlyDigits(message.from ?? conversation?.phone_number ?? '')
    if (!validPhone(from)) return { kind: 'ignored', reason: 'no_from' }
    // Una reacción (👍) no es un mensaje que haya que contestar.
    if (message.type === 'reaction') return { kind: 'ignored', reason: 'reaction' }
    return {
      kind: 'inbound',
      phoneNumberId,
      waMessageId: message.id,
      from,
      contactName: conversation?.contact_name ?? null,
      messageKind,
      text,
    }
  }

  // Saliente: solo nos importa el que escribió el dueño desde su celular. Los
  // nuestros (`cloud_api`), el historial que sincroniza Meta al conectar
  // (`history_sync`) y cualquier otro origen se ignoran.
  if (direction === 'outbound' && origin === 'business_app') {
    const to = onlyDigits(message.to ?? conversation?.phone_number ?? '')
    if (!validPhone(to)) return { kind: 'ignored', reason: 'no_to' }
    return { kind: 'owner', phoneNumberId, waMessageId: message.id, to, text }
  }

  return { kind: 'ignored', reason: `${direction ?? 'sin_direccion'}:${origin ?? 'sin_origen'}` }
}

/** Acepta un evento suelto o el sobre de lote (`batch: true`). */
export function normalizeKapsoPayload(body: unknown): NormalizedWhatsappEvent[] {
  const batch = batchSchema.safeParse(body)
  if (batch.success) return batch.data.data.map(normalizeOne)
  return [normalizeOne(body)]
}
