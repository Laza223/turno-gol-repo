import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'
import { bookings } from './bookings'
import { openMatchStatusEnum } from './enums'

// "Falta Uno": partido abierto creado desde una reserva para que otros jugadores
// se sumen. slots_total = jugadores que faltan; slots_filled = cuántos se anotaron
// (mantenido por trigger sync_open_match_slots). restrictions JSONB libre
// ({ gender, level, ... }). RLS: lectura pública, escritura solo el creador.
export const openMatches = pgTable(
  'open_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    creatorPlayerId: uuid('creator_player_id')
      .notNull()
      .references(() => players.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    slotsTotal: integer('slots_total').notNull(),
    slotsFilled: integer('slots_filled').notNull().default(0),
    restrictions: jsonb('restrictions').notNull().default(sql`'{}'::jsonb`),
    status: openMatchStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    slotsTotalCheck: check(
      'chk_open_match_slots_total_positive',
      sql`${table.slotsTotal} > 0`,
    ),
    slotsFilledCheck: check(
      'chk_open_match_slots_filled_valid',
      sql`${table.slotsFilled} >= 0 AND ${table.slotsFilled} <= ${table.slotsTotal}`,
    ),
    // Un solo partido abierto/lleno activo por booking (permite recrear tras cancelar).
    activeBookingUnique: uniqueIndex('uq_open_match_active_booking')
      .on(table.bookingId)
      .where(sql`status IN ('open', 'full')`),
    tenantStatusIdx: index('idx_open_matches_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    statusCreatedIdx: index('idx_open_matches_status_created').on(
      table.status,
      table.createdAt,
    ),
    creatorIdx: index('idx_open_matches_creator').on(table.creatorPlayerId),
  }),
)

// Jugadores anotados a un partido abierto. UNIQUE(open_match_id, player_id).
// RLS: lectura pública (roster); el jugador inserta/borra su propia inscripción.
// El conteo slots_filled y la transición open↔full se mantienen por trigger.
export const openMatchPlayers = pgTable(
  'open_match_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    openMatchId: uuid('open_match_id')
      .notNull()
      .references(() => openMatches.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    matchPlayerUnique: uniqueIndex('uq_open_match_players_match_player').on(
      table.openMatchId,
      table.playerId,
    ),
    matchIdx: index('idx_open_match_players_match').on(table.openMatchId),
    playerIdx: index('idx_open_match_players_player').on(table.playerId),
  }),
)
