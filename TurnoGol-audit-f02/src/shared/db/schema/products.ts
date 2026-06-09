import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    sku: text('sku'),
    category: text('category'),
    price: integer('price').notNull(),
    stock: integer('stock').notNull().default(0),
    lowStockAlert: integer('low_stock_alert').notNull().default(5),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pricePositive: check('chk_product_price_positive', sql`${table.price} > 0`),
    stockNonNegative: check(
      'chk_product_stock_non_negative',
      sql`${table.stock} >= 0`,
    ),
    tenantIdx: index('idx_products_tenant').on(table.tenantId),
    tenantActiveIdx: index('idx_products_tenant_active').on(
      table.tenantId,
      table.isActive,
    ),
  }),
)
