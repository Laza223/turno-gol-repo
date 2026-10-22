import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Dedupe de las alertas operativas por mail (migr. 097). Sin tenant_id, RLS
// deny-all (sin policies): solo turnogol_worker (BYPASSRLS) la toca. Ver
// whatsapp-ops-alerts.service.ts.
export const opsAlerts = pgTable('ops_alerts', {
  key: text('key').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
