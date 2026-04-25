import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import {
  notificationChannelEnum,
  notificationStatusEnum,
  recipientTypeEnum,
} from './enums'

// recipient_id NO tiene FK (apunta a players|staff_users|tenant_staff_members
// según recipient_type). Validado por trigger validate_notification_recipient (005).
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),

    recipientType: recipientTypeEnum('recipient_type').notNull(),
    recipientId: uuid('recipient_id').notNull(),

    channel: notificationChannelEnum('channel').notNull(),
    triggerEvent: text('trigger_event').notNull(),

    status: notificationStatusEnum('status').notNull().default('queued'),
    content: jsonb('content').notNull(),
    templateName: text('template_name'),

    attemptCount: integer('attempt_count').notNull().default(1),
    lastError: text('last_error'),

    queuedAt: timestamp('queued_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_notifications_tenant')
      .on(table.tenantId)
      .where(sql`tenant_id IS NOT NULL`),
    tenantStatusIdx: index('idx_notifications_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    recipientIdx: index('idx_notifications_recipient').on(table.recipientId),
    triggerIdx: index('idx_notifications_trigger').on(table.triggerEvent),
    queuedIdx: index('idx_notifications_queued')
      .on(table.status, table.queuedAt)
      .where(sql`status = 'queued'`),
  }),
)
