import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { players } from './players'
import { bookings } from './bookings'

/**
 * RIVAL v1 (migr. 099). Spec: docs/superpowers/specs/2026-10-22-rival-v1-design.md.
 *
 * Híbridas: RLS por `app.current_player_id` (ENABLE + FORCE). Los triggers y las
 * funciones SECURITY DEFINER de la migración hacen cumplir cupo, banco, estados
 * por actor y topes: este archivo es solo el espejo de tipos. Los valores
 * cerrados son CHECKs en la base, no enums de Postgres.
 */

export const rivalMatches = pgTable(
  'rival_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    organizerPlayerId: uuid('organizer_player_id')
      .notNull()
      .references(() => players.id),
    /** SET NULL: si la reserva se borra, el partido queda sin sello (se deriva en cada lectura). */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    courtDeclared: boolean('court_declared').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    format: integer('format').notNull(),
    capacity: integer('capacity').notNull(),
    level: text('level', { enum: ['tranqui', 'parejo', 'picante'] }).notNull(),
    /** Lo genera la DB (`rival_generate_invite_code()`), 10 símbolos. Nunca sale por `rival_board`. */
    inviteCode: text('invite_code')
      .notNull()
      .unique()
      .default(sql`rival_generate_invite_code()`),
    onBoard: boolean('on_board').notNull().default(false),
    seeking: text('seeking', { enum: ['players', 'rival'] }),
    seekingPosition: text('seeking_position', { enum: ['any', 'goalkeeper'] }),
    status: text('status', { enum: ['open', 'canceled'] })
      .notNull()
      .default('open'),
    hiddenAt: timestamp('hidden_at', { withTimezone: true, mode: 'date' }),
    /** Recuento de role='player' confirmed, mantenido por trigger. */
    confirmedCount: integer('confirmed_count').notNull().default(0),
    filledAt: timestamp('filled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    boardIdx: index('idx_rival_matches_board')
      .on(table.tenantId, table.startsAt)
      .where(sql`on_board AND status = 'open' AND hidden_at IS NULL`),
    organizerActiveIdx: index('idx_rival_matches_organizer_active')
      .on(table.organizerPlayerId, table.startsAt)
      .where(sql`status = 'open'`),
    tenantIdx: index('idx_rival_matches_tenant').on(table.tenantId),
  }),
)

/** WhatsApp del organizador de un partido publicado. Se borra al cancelar y al llegar `starts_at`. */
export const rivalMatchContacts = pgTable('rival_match_contacts', {
  matchId: uuid('match_id')
    .primaryKey()
    .references(() => rivalMatches.id, { onDelete: 'cascade' }),
  whatsappDigits: text('whatsapp_digits').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const rivalParticipants = pgTable(
  'rival_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    matchId: uuid('match_id')
      .notNull()
      .references(() => rivalMatches.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    role: text('role', { enum: ['player', 'rival_captain'] })
      .notNull()
      .default('player'),
    status: text('status', {
      enum: ['requested', 'confirmed', 'bench', 'declined', 'left', 'removed'],
    }).notNull(),
    origin: text('origin', { enum: ['invite', 'board'] }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    /** Orden de llegada al banco (lo escribe el trigger tras tomar el lock del partido). */
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    matchPlayerUnique: unique('uq_rival_participants_match_player').on(
      table.matchId,
      table.playerId,
    ),
    captainUnique: uniqueIndex('uq_rival_participants_captain')
      .on(table.matchId)
      .where(sql`role = 'rival_captain' AND status = 'confirmed'`),
    pendingIdx: index('idx_rival_participants_pending')
      .on(table.playerId)
      .where(sql`status = 'requested'`),
    matchStatusIdx: index('idx_rival_participants_match_status').on(
      table.matchId,
      table.status,
      table.createdAt,
    ),
    playerIdx: index('idx_rival_participants_player').on(table.playerId),
    tenantIdx: index('idx_rival_participants_tenant').on(table.tenantId),
  }),
)

export const rivalReports = pgTable(
  'rival_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => rivalMatches.id, { onDelete: 'cascade' }),
    reporterPlayerId: uuid('reporter_player_id')
      .notNull()
      .references(() => players.id),
    /** NULL = denuncia del partido. */
    reportedPlayerId: uuid('reported_player_id').references(() => players.id),
    reason: text('reason', { enum: ['not_exists', 'spam', 'offensive', 'minor'] }).notNull(),
    /** La calcula la DB; el cliente no la manda. */
    countsForAutohide: boolean('counts_for_autohide').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    // UNIQUE NULLS NOT DISTINCT (match_id, reporter_player_id, reported_player_id) vive en la migración.
    matchIdx: index('idx_rival_reports_match').on(table.matchId),
  }),
)

export const rivalAlertSubscriptions = pgTable(
  'rival_alert_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    onlyGoalkeeper: boolean('only_goalkeeper').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    playerTenantUnique: unique('uq_rival_alert_subscriptions_player_tenant').on(
      table.playerId,
      table.tenantId,
    ),
    tenantIdx: index('idx_rival_alert_subscriptions_tenant').on(table.tenantId),
  }),
)

/** Dedupe de alertas. Deny-all para la app (como `ops_alerts`): solo el worker. Sin `tenant_id` a propósito. */
export const rivalAlertSends = pgTable(
  'rival_alert_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => rivalMatches.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    /** Día calendario ART del envío. */
    sentOn: date('sent_on', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    matchPlayerUnique: unique('uq_rival_alert_sends_match_player').on(
      table.matchId,
      table.playerId,
    ),
    playerDayUnique: unique('uq_rival_alert_sends_player_day').on(table.playerId, table.sentOn),
  }),
)
