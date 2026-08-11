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
import { staffUsers } from './staff-users'
import { tournamentTeams } from './tournament-teams'
import { cashflowCategoryEnum, cashflowTypeEnum, paymentMethodEnum } from './enums'

// chk_cashflow_type_category — combinaciones válidas; 'expense' desde migración 025.
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

    /**
     * Migr. 066. Equipo al que corresponde el cobro de inscripción. Sin
     * ON DELETE: borrar un equipo que ya pagó tiene que fallar (el service lo
     * frena antes con un error propio). Va SIEMPRE junto con category
     * 'tournament' — el CHECK lo hace bidireccional.
     */
    tournamentTeamId: uuid('tournament_team_id').references(() => tournamentTeams.id),

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

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    amountPositive: check('chk_cashflow_amount_positive', sql`${table.amount} > 0`),
    typeCategoryValid: check(
      'chk_cashflow_type_category',
      // Espejo del CHECK real (migr. 066 recrea el de 050 comparando ::text).
      sql`(${table.type} = 'income' AND ${table.category} IN ('booking', 'product_sale', 'other', 'tournament'))
        OR (${table.type} = 'adjustment' AND ${table.category} IN ('other', 'no_show_correction'))
        OR (${table.type} = 'expense' AND ${table.category} IN ('operating_expense', 'merchandise', 'salaries', 'utilities', 'maintenance', 'other_expense'))`,
    ),
    // Migr. 066. Categoría 'tournament' ⟺ hay equipo. Ver la migración: sin la
    // ida el total de la categoría deja de cuadrar con lo cobrado por equipo;
    // sin la vuelta el formulario genérico de Caja podría colgar un equipo a
    // cualquier movimiento.
    tournamentTeamValid: check(
      'chk_cashflow_tournament_team',
      sql`(${table.category} = 'tournament') = (${table.tournamentTeamId} IS NOT NULL)`,
    ),
    tenantIdx: index('idx_cash_flows_tenant').on(table.tenantId),
    tenantDateIdx: index('idx_cash_flows_tenant_date').on(table.tenantId, table.occurredAt),
    tenantTypeIdx: index('idx_cash_flows_tenant_type').on(table.tenantId, table.type),
    tenantCategoryIdx: index('idx_cash_flows_tenant_category').on(table.tenantId, table.category),
    // Migr. 066. Parcial: solo las filas de torneo, que son minoría.
    tournamentTeamIdx: index('idx_cash_flows_tournament_team')
      .on(table.tournamentTeamId)
      .where(sql`tournament_team_id IS NOT NULL`),
    // Fix #55: índice UNIQUE parcial que respalda el ON CONFLICT (client_idempotency_key)
    // en createCashFlow(). Debe coincidir con la migración 023_cashflow_idempotency_key.sql.
    idempotencyKeyIdx: uniqueIndex('idx_cash_flows_idempotency_key')
      .on(table.clientIdempotencyKey)
      .where(sql`${table.clientIdempotencyKey} IS NOT NULL`),
  }),
)
