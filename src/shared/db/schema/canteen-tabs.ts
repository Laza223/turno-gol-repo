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
import { staffUsers } from './staff-users'
import { cashFlows } from './cash-flows'
import { canteenTabStatusEnum } from './enums'

// Fiados de cantina ("anotáselo al capitán", migración 048): la venta queda
// a cobrar con nombre libre, el stock sale al entregar (líneas en
// stock_movements con tab_id) y el cash_flow se crea recién al saldar.
// Anular = status 'canceled' (sin DELETE; REVOKE a nivel rol).
export const canteenTabs = pgTable(
  'canteen_tabs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // Nombre libre: no exige jugador registrado.
    debtorName: text('debtor_name').notNull(),
    status: canteenTabStatusEnum('status').notNull().default('open'),
    // Centavos ARS, snapshot al entregar.
    totalAmount: integer('total_amount').notNull(),
    note: text('note'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => staffUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),

    settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
    settledBy: uuid('settled_by').references(() => staffUsers.id),
    settledCashFlowId: uuid('settled_cash_flow_id').references(() => cashFlows.id),

    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    canceledBy: uuid('canceled_by').references(() => staffUsers.id),
    canceledReason: text('canceled_reason'),

    // Crear un fiado no genera cash_flow: idempotencia propia (patrón 023).
    clientIdempotencyKey: uuid('client_idempotency_key'),
  },
  (table) => ({
    debtorNonempty: check('chk_tab_debtor_nonempty', sql`length(trim(${table.debtorName})) > 0`),
    amountPositive: check('chk_tab_amount_positive', sql`${table.totalAmount} > 0`),
    paidConsistency: check(
      'chk_tab_paid_consistency',
      sql`${table.status} <> 'paid' OR (${table.settledAt} IS NOT NULL AND ${table.settledCashFlowId} IS NOT NULL)`,
    ),
    canceledConsistency: check(
      'chk_tab_canceled_consistency',
      sql`${table.status} <> 'canceled' OR ${table.canceledAt} IS NOT NULL`,
    ),
    idempotencyIdx: uniqueIndex('uq_canteen_tabs_idem')
      .on(table.clientIdempotencyKey)
      .where(sql`${table.clientIdempotencyKey} IS NOT NULL`),
    openIdx: index('idx_canteen_tabs_open')
      .on(table.tenantId, table.createdAt)
      .where(sql`${table.status} = 'open'`),
    tenantIdx: index('idx_canteen_tabs_tenant').on(table.tenantId, table.createdAt),
  }),
)
