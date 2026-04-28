import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { courts } from './courts'
import { players } from './players'
import { abonadoStatusEnum, abonadoPaymentMethodEnum } from './enums'

export const abonados = pgTable(
  'abonados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    courtId: uuid('court_id')
      .notNull()
      .references(() => courts.id),
    playerId: uuid('player_id').references(() => players.id),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone').notNull(),

    dayOfWeek: smallint('day_of_week').notNull(),
    timeStart: time('time_start').notNull(),
    timeEnd: time('time_end').notNull(),

    pricePerSession: integer('price_per_session').notNull(),
    monthlyPrice: integer('monthly_price').notNull(),

    startsOn: date('starts_on', { mode: 'date' }).notNull(),
    endsOn: date('ends_on', { mode: 'date' }),

    status: abonadoStatusEnum('status').notNull().default('active'),
    paymentMethod: abonadoPaymentMethodEnum('payment_method')
      .notNull()
      .default('cash'),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    timeValid: check(
      'chk_abonado_time_valid',
      sql`${table.timeEnd} > ${table.timeStart}`,
    ),
    dayValid: check(
      'chk_abonado_day_valid',
      sql`${table.dayOfWeek} BETWEEN 0 AND 6`,
    ),
    pricePositive: check(
      'chk_abonado_price_positive',
      sql`${table.pricePerSession} > 0`,
    ),
    tenantIdx: index('idx_abonados_tenant').on(table.tenantId),
    tenantStatusIdx: index('idx_abonados_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    courtIdx: index('idx_abonados_court').on(table.tenantId, table.courtId),
    playerIdx: index('idx_abonados_player')
      .on(table.playerId)
      .where(sql`player_id IS NOT NULL`),
  }),
)
