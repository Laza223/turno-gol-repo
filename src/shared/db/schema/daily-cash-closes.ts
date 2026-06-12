import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { staffUsers } from './staff-users'

// total_expense agregado en migración 025 (rediseño de Caja); supersede Fix #8.
// Inmutable post-cierre (REVOKE UPDATE/DELETE en 008).
export const dailyCashCloses = pgTable(
  'daily_cash_closes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    date: date('date', { mode: 'date' }).notNull(),

    totalIncome: integer('total_income').notNull().default(0),
    totalAdjustments: integer('total_adjustments').notNull().default(0),
    totalExpense: integer('total_expense').notNull().default(0),
    balance: integer('balance').notNull().default(0),

    declaredCash: integer('declared_cash').notNull().default(0),
    diffAmount: integer('diff_amount').notNull().default(0),

    note: text('note'),
    closedBy: uuid('closed_by')
      .notNull()
      .references(() => staffUsers.id),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqPerTenant: unique('uq_daily_close_per_tenant').on(
      table.tenantId,
      table.date,
    ),
    incomeNonNegative: check(
      'chk_income_non_negative',
      sql`${table.totalIncome} >= 0`,
    ),
    adjustmentsNonNegative: check(
      'chk_adjustments_non_negative',
      sql`${table.totalAdjustments} >= 0`,
    ),
    expenseNonNegative: check(
      'chk_expense_non_negative',
      sql`${table.totalExpense} >= 0`,
    ),
    tenantIdx: index('idx_daily_closes_tenant').on(table.tenantId),
    tenantDateIdx: index('idx_daily_closes_tenant_date').on(
      table.tenantId,
      table.date,
    ),
  }),
)
