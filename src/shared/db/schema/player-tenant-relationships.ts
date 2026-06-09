import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'

export const playerTenantRelationships = pgTable(
  'player_tenant_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),

    bookingsCount: integer('bookings_count').notNull().default(0),
    noshowCount: integer('noshow_count').notNull().default(0),

    // Saldo deudor del jugador en este complejo, en centavos de ARS.
    // Si > 0, el jugador queda bloqueado para reservar online en este complejo
    // (ver CLAUDE.md §schema y createOnlineBooking). No es una billetera virtual:
    // refunds/no-shows se concilian entre jugador y complejo.
    balance: integer('balance').notNull().default(0),
    lastBookingAt: timestamp('last_booking_at', {
      withTimezone: true,
      mode: 'date',
    }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),

    status: text('status').notNull().default('active'),

    dataConsentAt: timestamp('data_consent_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'chk_ptr_status_valid',
      sql`${table.status} IN ('active', 'blocked')`,
    ),
    uqPlayerTenant: unique('uq_player_tenant').on(table.playerId, table.tenantId),
    tenantIdx: index('idx_ptr_tenant').on(table.tenantId),
    playerIdx: index('idx_ptr_player').on(table.playerId),
    tenantStatusIdx: index('idx_ptr_tenant_status').on(
      table.tenantId,
      table.status,
    ),
  }),
)
