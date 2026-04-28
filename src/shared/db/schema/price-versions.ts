import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
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
    validFrom: date('valid_from', { mode: 'date' }).notNull(),
    validUntil: date('valid_until', { mode: 'date' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    planIdx: index('idx_price_versions_plan').on(table.planId, table.validFrom),
  }),
)
