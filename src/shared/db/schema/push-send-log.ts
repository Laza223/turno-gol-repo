import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { notifications } from './notifications'

// Idempotencia del worker push-send (F3, hallazgo D4, migr. 059). Sin
// tenant_id: tabla operacional interna, RLS deny-all (sin policies) — solo
// turnogol_worker (BYPASSRLS) la toca. Ver push.worker.ts / push.service.ts.
export const pushSendLog = pgTable(
  'push_send_log',
  {
    dedupeKey: text('dedupe_key').primaryKey(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'cascade',
    }),
    subscriptionId: uuid('subscription_id'),
    status: text('status').notNull().default('legacy_unknown'),
    attemptCount: integer('attempt_count').notNull().default(0),
    leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'date' }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
  },
  (table) => [index('idx_push_send_log_notification').on(table.notificationId)],
)
