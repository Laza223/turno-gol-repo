import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// Catálogo de cantina (migración 048): reemplaza el JSONB
// tenants.settings->'canteen_products'. Soft delete via is_active — NUNCA
// se borra una fila (stock_movements la referencia); el REVOKE DELETE de la
// migración lo hace cumplir a nivel rol.
export const canteenProducts = pgTable(
  'canteen_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    name: text('name').notNull(),
    // Centavos ARS.
    price: integer('price').notNull(),
    // Costo actual opcional (margen visible). Sin historial: se pisa al reponer.
    cost: integer('cost'),
    // NULL = sin control de stock (se vende sin límite ni descuento).
    stock: integer('stock'),
    // NULL = sin alerta de stock bajo.
    minStock: integer('min_stock'),

    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    nameNonempty: check('chk_canteen_name_nonempty', sql`length(trim(${table.name})) > 0`),
    pricePositive: check('chk_canteen_price_positive', sql`${table.price} > 0`),
    costNonneg: check('chk_canteen_cost_nonneg', sql`${table.cost} IS NULL OR ${table.cost} >= 0`),
    stockNonneg: check(
      'chk_canteen_stock_nonneg',
      sql`${table.stock} IS NULL OR ${table.stock} >= 0`,
    ),
    minStockNonneg: check(
      'chk_canteen_minstock_nonneg',
      sql`${table.minStock} IS NULL OR ${table.minStock} >= 0`,
    ),
    tenantIdx: index('idx_canteen_products_tenant').on(
      table.tenantId,
      table.isActive,
      table.sortOrder,
    ),
  }),
)
