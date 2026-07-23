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
import { canteenProducts } from './canteen-products'
import { canteenTabs } from './canteen-tabs'
import { stockMovementKindEnum } from './enums'

// Ledger de stock de cantina (migración 048). Append-only para turnogol_app
// (REVOKE UPDATE/DELETE, patrón audit_logs): una corrección es un movimiento
// 'adjustment' compensatorio, nunca un UPDATE.
// TODA venta escribe líneas acá — aunque el producto no controle stock —
// porque el ledger es a la vez auditoría y la fuente del ranking de ventas;
// solo el UPDATE de canteen_products.stock se saltea cuando stock IS NULL.
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => canteenProducts.id),

    kind: stockMovementKindEnum('kind').notNull(),
    // Con signo: entradas +, salidas −.
    qty: integer('qty').notNull(),
    // Centavos ARS; solo purchase, opcional.
    unitCost: integer('unit_cost'),
    // Centavos ARS; snapshot del precio de venta (obligatorio en 'sale').
    unitPrice: integer('unit_price'),
    // Motivo: obligatorio en waste/courtesy/internal_use/adjustment (a nivel service).
    note: text('note'),

    // Agrupadores de ticket: cobrado → cash_flow_id; fiado → tab_id.
    cashFlowId: uuid('cash_flow_id').references(() => cashFlows.id),
    tabId: uuid('tab_id').references(() => canteenTabs.id),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => staffUsers.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),

    // Idempotencia para movimientos SIN cash_flow (reposición, merma, ajuste).
    clientIdempotencyKey: uuid('client_idempotency_key'),
  },
  (table) => ({
    qtySign: check(
      'chk_stock_qty_sign',
      sql`(${table.kind} = 'purchase' AND ${table.qty} > 0)
        OR (${table.kind} IN ('sale', 'waste', 'courtesy', 'internal_use') AND ${table.qty} < 0)
        OR (${table.kind} = 'adjustment' AND ${table.qty} <> 0)`,
    ),
    saleHasPrice: check(
      'chk_sale_has_price',
      sql`${table.kind} <> 'sale' OR ${table.unitPrice} IS NOT NULL`,
    ),
    saleHasParent: check(
      'chk_sale_has_parent',
      sql`${table.kind} <> 'sale' OR ${table.cashFlowId} IS NOT NULL OR ${table.tabId} IS NOT NULL`,
    ),
    idempotencyIdx: uniqueIndex('uq_stock_movements_idem')
      .on(table.clientIdempotencyKey)
      .where(sql`${table.clientIdempotencyKey} IS NOT NULL`),
    tenantDayIdx: index('idx_stock_movements_tenant_day').on(
      table.tenantId,
      table.occurredAt,
    ),
    productIdx: index('idx_stock_movements_product').on(
      table.tenantId,
      table.productId,
    ),
    cashFlowIdx: index('idx_stock_movements_cash_flow')
      .on(table.cashFlowId)
      .where(sql`${table.cashFlowId} IS NOT NULL`),
    tabIdx: index('idx_stock_movements_tab')
      .on(table.tabId)
      .where(sql`${table.tabId} IS NOT NULL`),
  }),
)
