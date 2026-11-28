import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { abonados } from './abonados'
import { courts } from './courts'
import { staffUsers } from './staff-users'

export const bookingSettlements = pgTable(
  'booking_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    abonadoId: uuid('abonado_id').references(() => abonados.id, { onDelete: 'set null' }),
    courtId: uuid('court_id').references(() => courts.id, { onDelete: 'set null' }),

    kind: text('kind').notNull(),
    paymentOrigin: text('payment_origin').notNull(),
    amount: integer('amount').notNull().default(0),

    creditsTotal: integer('credits_total'),
    periodStart: date('period_start', { mode: 'date' }),
    periodEnd: date('period_end', { mode: 'date' }),

    createdByStaff: uuid('created_by_staff')
      .notNull()
      .references(() => staffUsers.id),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    voidedByStaff: uuid('voided_by_staff').references(() => staffUsers.id),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    kindValid: check(
      'chk_booking_settlements_kind',
      sql`${table.kind} IN ('pack', 'monthly', 'bookings')`,
    ),
    originValid: check(
      'chk_booking_settlements_origin',
      sql`${table.paymentOrigin} IN ('caja', 'already_settled')`,
    ),
    amountValid: check(
      'chk_booking_settlements_amount',
      sql`(${table.paymentOrigin} = 'caja' AND ${table.amount} > 0) OR (${table.paymentOrigin} = 'already_settled' AND ${table.amount} >= 0)`,
    ),
    creditsValid: check(
      'chk_booking_settlements_credits',
      sql`(${table.kind} = 'pack' AND ${table.creditsTotal} IS NOT NULL AND ${table.creditsTotal} >= 1) OR (${table.kind} <> 'pack' AND ${table.creditsTotal} IS NULL)`,
    ),
    periodValid: check(
      'chk_booking_settlements_period',
      sql`(${table.kind} = 'monthly' AND ${table.periodStart} IS NOT NULL AND ${table.periodEnd} IS NOT NULL AND ${table.periodEnd} >= ${table.periodStart}) OR (${table.kind} <> 'monthly' AND ${table.periodStart} IS NULL AND ${table.periodEnd} IS NULL)`,
    ),
    tenantCreatedIdx: index('idx_booking_settlements_tenant_created').on(
      table.tenantId,
      table.createdAt,
    ),
    abonadoActiveIdx: index('idx_booking_settlements_abonado_active')
      .on(table.tenantId, table.abonadoId)
      .where(sql`abonado_id IS NOT NULL AND voided_at IS NULL`),
  }),
)
