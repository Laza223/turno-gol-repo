import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
// El `jsonb` de pg-core lo guarda doble-codificado (un string): ver ../jsonb.ts.
import { jsonb } from '../jsonb'
import { tenants } from './tenants'
import { bookings } from './bookings'
import {
  whatsappChats,
  WHATSAPP_MESSAGE_DIRECTIONS,
  WHATSAPP_MESSAGE_KINDS,
  WHATSAPP_NOTICES,
} from './whatsapp'

/**
 * Mensajes del bot (migr. 096): entrantes, salientes y echoes del dueño. Son a
 * la vez el contexto de la conversación y la instrumentación del piloto. Se
 * purgan a los 30 días.
 */
export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => whatsappChats.id, { onDelete: 'cascade' }),
    direction: text('direction', { enum: WHATSAPP_MESSAGE_DIRECTIONS }).notNull(),
    /** Idempotencia del webhook. NULL solo para un saliente que Meta rechazó. */
    waMessageId: text('wa_message_id').unique(),
    kind: text('kind', { enum: WHATSAPP_MESSAGE_KINDS }).notNull().default('text'),
    /** Texto, o la transcripción de un audio. */
    body: text('body'),
    /** Entrantes: cuándo los consumió un turno del bot. NULL = pendiente. */
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    inputTokens: integer('input_tokens'),
    cachedTokens: integer('cached_tokens'),
    outputTokens: integer('output_tokens'),
    /**
     * Salientes del bot: los mensajes de la API de ese turno (llamadas a
     * herramientas y sus resultados, sin thinking). El modelo los vuelve a ver
     * en los turnos siguientes. Lo valida quien lo lee.
     */
    toolTrace: jsonb('tool_trace').$type<unknown>(),
    // CASCADE: un aviso exige booking_id (CHECK), así que SET NULL rompería el borrado.
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
    notice: text('notice', { enum: WHATSAPP_NOTICES }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_whatsapp_messages_chat_created').on(t.chatId, t.createdAt),
    index('idx_whatsapp_messages_pending')
      .on(t.createdAt)
      .where(sql`direction = 'inbound' AND processed_at IS NULL`),
    index('idx_whatsapp_messages_tenant_created').on(t.tenantId, t.createdAt),
    uniqueIndex('uq_whatsapp_messages_booking_notice')
      .on(t.bookingId, t.notice)
      .where(sql`notice IS NOT NULL`),
  ],
)
