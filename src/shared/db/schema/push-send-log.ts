import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Idempotencia del worker push-send (F3, hallazgo D4, migr. 059). Sin
// tenant_id: tabla operacional interna, RLS deny-all (sin policies) — solo
// turnogol_worker (BYPASSRLS) la toca. Ver push.worker.ts / push.service.ts.
export const pushSendLog = pgTable('push_send_log', {
  dedupeKey: text('dedupe_key').primaryKey(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
