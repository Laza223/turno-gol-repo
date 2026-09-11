import { sql } from 'drizzle-orm'
import { check, date, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { staffUsers } from './staff-users'

// Apertura de caja (migración 049): fondo inicial en efectivo por día.
// El flujo de apertura/cierre se eliminó (ver docs/decisions/) — la tabla
// queda con datos históricos, sin escritura ni lectura desde código de
// aplicación. Nunca reinterpretar ni migrar estas filas.
export const dailyCashOpens = pgTable(
  'daily_cash_opens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),

    date: date('date', { mode: 'date' }).notNull(),
    // Centavos ARS.
    openingCash: integer('opening_cash').notNull().default(0),
    note: text('note'),

    openedBy: uuid('opened_by')
      .notNull()
      .references(() => staffUsers.id),
    openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    perTenantDay: unique('uq_daily_open_per_tenant').on(table.tenantId, table.date),
    openingCashNonneg: check('chk_opening_cash_nonneg', sql`${table.openingCash} >= 0`),
  }),
)
