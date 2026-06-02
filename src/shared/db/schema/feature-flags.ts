import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// Operational feature toggles (Fase 6). A row with tenant_id = NULL is a GLOBAL
// default; a row with tenant_id set is a per-tenant override (e.g. the `suspended`
// kill switch). Uniqueness is enforced by partial unique indexes defined in
// migration 015 (one global row per key, one row per key+tenant) — not by a plain
// UNIQUE(key), which would forbid having a global flag and a tenant override of
// the same key simultaneously.
export const featureFlags = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  value: boolean('value').notNull().default(false),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})
