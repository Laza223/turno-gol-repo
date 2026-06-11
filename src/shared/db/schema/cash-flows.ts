import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { bookings } from './bookings'
import { products } from './products'
import { staffUsers } from './staff-users'
import {
  cashflowCategoryEnum,
  cashflowTypeEnum,
  paymentMethodEnum,
} from './enums'

// Fix #7 F2: chk_cashflow_type_category — combinaciones válidas, sin 'expense'.
export const cashFlows = pgTable(
  'cash_flows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    type: cashflowTypeEnum('type').notNull(),
    category: cashflowCategoryEnum('category').notNull(),

    amount: integer('amount').notNull(),
    method: paymentMethodEnum('method').notNull(),
    description: text('description').notNull(),

    bookingId: uuid('booking_id').references(() => bookings.id),
    productId: uuid('product_id').references(() => products.id),

    registeredBy: uuid('registered_by')
      .notNull()
      .references(() => staffUsers.id),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),

    // Fix #55: clave de idempotencia generada por el cliente (UUID v4).
    // Evita que un doble-submit o reintento de red cree movimientos duplicados.
    clientIdempotencyKey: text('client_idempotency_key'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    amountPositive: check(
      'chk_cashflow_amount_positive',
      sql`${table.amount} > 0`,
    ),
    typeCategoryValid: check(
      'chk_cashflow_type_category',
      sql`(${table.type} = 'income' AND ${table.category} IN ('booking', 'product_sale', 'other'))
        OR (${table.type} = 'adjustment' AND ${table.category} IN ('other', 'no_show_correction'))`,
    ),
    tenantIdx: index('idx_cash_flows_tenant').on(table.tenantId),
    tenantDateIdx: index('idx_cash_flows_tenant_date').on(
      table.tenantId,
      table.occurredAt,
    ),
    tenantTypeIdx: index('idx_cash_flows_tenant_type').on(
      table.tenantId,
      table.type,
    ),
    tenantCategoryIdx: index('idx_cash_flows_tenant_category').on(
      table.tenantId,
      table.category,
    ),
    // Fix #55: índice UNIQUE parcial que respalda el ON CONFLICT (client_idempotency_key)
    // en createCashFlow(). Debe coincidir con la migración 023_cashflow_idempotency_key.sql.
    idempotencyKeyIdx: uniqueIndex('idx_cash_flows_idempotency_key')
      .on(table.clientIdempotencyKey)
      .where(sql`${table.clientIdempotencyKey} IS NOT NULL`),
  }),
)
