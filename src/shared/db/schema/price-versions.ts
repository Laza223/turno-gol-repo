import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { plans } from './plans'

export const priceVersions = pgTable(
  'price_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    priceMonthly: integer('price_monthly').notNull(),
    priceAnnual: integer('price_annual').notNull(),
    // Migr. 090: la version historica guarda la REGLA lineal, no un precio fijo.
    priceFirstCourtCents: integer('price_first_court_cents'),
    priceExtraCourtCents: integer('price_extra_court_cents'),
    annualDiscountBps: integer('annual_discount_bps'),
    validFrom: date('valid_from', { mode: 'date' }).notNull(),
    validUntil: date('valid_until', { mode: 'date' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    planIdx: index('idx_price_versions_plan').on(table.planId, table.validFrom),
  }),
)
