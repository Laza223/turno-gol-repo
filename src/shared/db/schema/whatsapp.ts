import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

/**
 * Bot de WhatsApp del complejo (migr. 096). Decisión:
 * docs/decisions/2026-10-20-bot-whatsapp.md.
 *
 * `whatsapp_messages` vive en `whatsapp-messages.ts` porque referencia
 * `bookings`, y `bookings` referencia `whatsapp_chats`: el barrel exporta este
 * archivo antes de bookings y aquel después.
 */

/** Número del complejo conectado. Uno por complejo. */
export const whatsappConnections = pgTable('whatsapp_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id),
  provider: text('provider', { enum: ['kapso', 'meta'] })
    .notNull()
    .default('kapso'),
  /** Id que Meta manda en cada webhook. UNIQUE global: resuelve el complejo. */
  phoneNumberId: text('phone_number_id').notNull().unique(),
  wabaId: text('waba_id'),
  displayPhoneNumber: text('display_phone_number'),
  status: text('status', { enum: ['connected', 'disconnected'] })
    .notNull()
    .default('connected'),
  /** Corte del día a día por complejo. El flag `whatsapp_bot` es el gate de la feature. */
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

/** ENUM cerrado: nunca texto libre sobre personas (Ley 25.326). */
export const WHATSAPP_PAUSE_REASONS = [
  'owner_replied',
  'handoff_weather',
  'handoff_complaint',
  'handoff_event',
  'handoff_other',
  'bot_error',
  'manual',
] as const
export type WhatsappPauseReason = (typeof WHATSAPP_PAUSE_REASONS)[number]

/** Conversación = (complejo, teléfono del jugador). */
export const whatsappChats = pgTable(
  'whatsapp_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Solo dígitos, como lo manda Meta en `from`. */
    waPhone: text('wa_phone').notNull(),
    /** Nombre de perfil que el propio jugador puso en WhatsApp. */
    displayName: text('display_name'),
    pausedUntil: timestamp('paused_until', { withTimezone: true, mode: 'date' }),
    pauseReason: text('pause_reason', { enum: WHATSAPP_PAUSE_REASONS }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_whatsapp_chats_tenant_phone').on(t.tenantId, t.waPhone),
    index('idx_whatsapp_chats_tenant_last_inbound').on(t.tenantId, t.lastInboundAt.desc()),
  ],
)

export const WHATSAPP_MESSAGE_DIRECTIONS = ['inbound', 'outbound', 'owner'] as const
export const WHATSAPP_MESSAGE_KINDS = ['text', 'audio', 'image', 'interactive', 'other'] as const
export const WHATSAPP_NOTICES = [
  'deposit_confirmed',
  'hold_expired',
  'late_payment_refunded',
] as const
export type WhatsappNotice = (typeof WHATSAPP_NOTICES)[number]
