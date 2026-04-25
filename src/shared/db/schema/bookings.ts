import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { courts } from './courts'
import { players } from './players'
import { abonados } from './abonados'
import { staffUsers } from './staff-users'
import {
  bookingStatusEnum,
  bookingTypeEnum,
  cancellationActorEnum,
  depositStatusEnum,
  paymentMethodEnum,
} from './enums'

// Fix #11 F2: payment_method nullable + chk_booking_payment_consistency.
// payment_id NO tiene FK aquí en TS (en SQL se cierra con ALTER post-payments).
// Drizzle no necesita expresar la FK circular para tipado.
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courtId: uuid('court_id')
      .notNull()
      .references(() => courts.id),
    playerId: uuid('player_id').references(() => players.id),
    abonadoId: uuid('abonado_id').references(() => abonados.id),
    createdByStaff: uuid('created_by_staff').references(() => staffUsers.id),

    date: date('date', { mode: 'date' }).notNull(),
    timeStart: time('time_start').notNull(),
    timeEnd: time('time_end').notNull(),

    type: bookingTypeEnum('type').notNull().default('spontaneous'),
    status: bookingStatusEnum('status').notNull().default('pending_payment'),

    priceSnapshot: integer('price_snapshot').notNull(),
    depositAmount: integer('deposit_amount').notNull().default(0),
    depositStatus: depositStatusEnum('deposit_status')
      .notNull()
      .default('not_required'),

    paymentMethod: paymentMethodEnum('payment_method'),
    paymentId: uuid('payment_id'),

    notesInternal: text('notes_internal'),
    notesPlayer: text('notes_player'),

    guestName: text('guest_name'),
    guestPhone: text('guest_phone'),

    canceledReason: text('canceled_reason'),
    canceledBy: cancellationActorEnum('canceled_by'),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    timeValid: check(
      'chk_time_valid',
      sql`${table.timeEnd} > ${table.timeStart}`,
    ),
    pricePositive: check('chk_price_positive', sql`${table.priceSnapshot} >= 0`),
    depositNonNegative: check(
      'chk_deposit_non_negative',
      sql`${table.depositAmount} >= 0`,
    ),
    paymentConsistency: check(
      'chk_booking_payment_consistency',
      sql`(${table.paymentMethod} = 'mercadopago' AND ${table.paymentId} IS NOT NULL) OR
          (${table.paymentMethod} IN ('cash', 'transfer', 'other') AND ${table.paymentId} IS NULL) OR
          (${table.paymentMethod} IS NULL AND ${table.depositStatus} = 'not_required')`,
    ),
    tenantIdx: index('idx_bookings_tenant').on(table.tenantId),
    tenantDateIdx: index('idx_bookings_tenant_date').on(
      table.tenantId,
      table.date,
    ),
    tenantCourtDateIdx: index('idx_bookings_tenant_court_date').on(
      table.tenantId,
      table.courtId,
      table.date,
    ),
    playerIdx: index('idx_bookings_player')
      .on(table.playerId)
      .where(sql`player_id IS NOT NULL`),
    abonadoIdx: index('idx_bookings_abonado')
      .on(table.abonadoId)
      .where(sql`abonado_id IS NOT NULL`),
    statusIdx: index('idx_bookings_status').on(table.tenantId, table.status),
    dateStatusIdx: index('idx_bookings_date_status').on(
      table.tenantId,
      table.date,
      table.status,
    ),
  }),
)
