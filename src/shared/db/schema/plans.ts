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
  // Modelo de bandas (legacy). Se conservan como valor de referencia de la
  // fila unica; el cobro real NO sale de aca. DROP en una migracion de
  // contraccion posterior (migr. 090/091).
  priceMonthly: integer('price_monthly').notNull(),
  priceAnnual: integer('price_annual').notNull(),
  // Precio LINEAL POR CANCHA (migr. 090). El monto no es una columna: lo
  // calcula `src/modules/billing/pricing.ts` sobre `billed_courts`.
  // Nullable porque solo la fila `turnogol` los usa.
  priceFirstCourtCents: integer('price_first_court_cents'),
  priceExtraCourtCents: integer('price_extra_court_cents'),
  /** Descuento del ciclo anual en basis points. 1000 = 10%. */
  annualDiscountBps: integer('annual_discount_bps'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
