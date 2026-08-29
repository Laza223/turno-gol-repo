import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { bookings } from './bookings'
import { players } from './players'
import { paymentMethodEnum, paymentStatusEnum, paymentTypeEnum } from './enums'

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    bookingId: uuid('booking_id').references(() => bookings.id),
    playerId: uuid('player_id').references(() => players.id),

    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('ARS'),
    type: paymentTypeEnum('type').notNull(),
    method: paymentMethodEnum('method').notNull(),
    status: paymentStatusEnum('status').notNull().default('pending'),

    mpPaymentId: text('mp_payment_id').unique(),
    mpPreferenceId: text('mp_preference_id'),

    description: text('description'),

    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    amountPositive: check('chk_payment_amount_positive', sql`${table.amount} > 0`),
    bookingIdx: index('idx_payments_booking')
      .on(table.bookingId)
      .where(sql`booking_id IS NOT NULL`),
    playerIdx: index('idx_payments_player')
      .on(table.playerId)
      .where(sql`player_id IS NOT NULL`),
    mpPreferenceIdx: index('idx_payments_mp_preference')
      .on(table.mpPreferenceId)
      .where(sql`mp_preference_id IS NOT NULL`),
    tenantStatusIdx: index('idx_payments_tenant_status').on(table.tenantId, table.status),
    tenantCreatedIdx: index('idx_payments_tenant_created').on(table.tenantId, table.createdAt),
    // Migr. 061 (reconciliación contable D4 §7): sweep cross-tenant
    // (turnogol_worker, sin tenant_id en el WHERE) — ver reconciliation.service.ts.
    approvedCreatedIdx: index('idx_payments_approved_created')
      .on(table.createdAt)
      .where(sql`status = 'approved'`),
  }),
)
