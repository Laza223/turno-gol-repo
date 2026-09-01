import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { jsonb } from '../jsonb'

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  maxCourts: integer('max_courts'),
  features: jsonb('features')
    .notNull()
    .default(
      sql`'{"history_months": 6, "export_formats": ["csv"], "api_access": false, "support_channels": ["email"]}'::jsonb`,
    ),
  priceMonthly: integer('price_monthly').notNull(),
  priceAnnual: integer('price_annual').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  // Complejo dueño del plan cuando es PRIVADO (precio especial, plan heredado,
  // piloto). NULL = público. Migr. 083.
  //
  // No reemplaza a `is_active`: ese sigue siendo el interruptor de encendido y
  // este es el alcance de visibilidad. El índice parcial que lo acompaña
  // (`WHERE owner_tenant_id IS NOT NULL`) no se declara acá porque drizzle-kit
  // no genera índices parciales — mismo caso que `tenants.mp_user_id`.
  ownerTenantId: uuid('owner_tenant_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
