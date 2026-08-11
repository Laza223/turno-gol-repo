import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { staffUsers } from './staff-users'
import { tournamentFormatEnum, tournamentStatusEnum } from './enums'

// Migración 062. La competencia en sí: formato, fechas, reglas de puntaje y
// desempate, cupo e inscripción. Las horas que ocupa NO viven acá: son filas
// de bookings con type 'tournament' + tournament_id (mismo mecanismo que
// abonado_id + 'fixed'), porque el exclusion constraint de bookings es lo
// único que impide sobrevender una cancha.
export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    /** Portal público (fase 4). Único por complejo, no global. */
    slug: text('slug').notNull(),
    format: tournamentFormatEnum('format').notNull(),
    status: tournamentStatusEnum('status').notNull().default('draft'),

    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    /** NULL = abierto (liga en curso sin fecha de cierre). */
    endsOn: date('ends_on', { mode: 'string' }),
    registrationDeadline: date('registration_deadline', { mode: 'string' }),
    /** NULL = sin cupo. */
    maxTeams: integer('max_teams'),

    /** Duración del PARTIDO, independiente del turno de 60 min de la grilla. */
    matchDurationMinutes: integer('match_duration_minutes').notNull().default(60),
    restBetweenMatchesMinutes: integer('rest_between_matches_minutes').notNull().default(0),

    /** Centavos ARS. */
    inscriptionFee: integer('inscription_fee').notNull().default(0),

    pointsWin: smallint('points_win').notNull().default(3),
    pointsDraw: smallint('points_draw').notNull().default(1),
    pointsLoss: smallint('points_loss').notNull().default(0),

    /**
     * Criterios de desempate ORDENADOS, aplicados después de los puntos.
     * Los valores válidos los valida Zod, no la DB: la lista crece sin migración.
     */
    tiebreakers: text('tiebreakers')
      .array()
      .notNull()
      .default(
        sql`ARRAY['goal_diff', 'goals_for', 'head_to_head', 'fair_play', 'drawn_lots']::text[]`,
      ),

    yellowCardsForSuspension: smallint('yellow_cards_for_suspension').notNull().default(3),
    redCardSuspensionMatches: smallint('red_card_suspension_matches').notNull().default(1),
    /** Goles del equipo que sí se presentó, cuando el rival no aparece. */
    walkoverGoalsFor: smallint('walkover_goals_for').notNull().default(3),

    isPublic: boolean('is_public').notNull().default(false),
    notes: text('notes'),

    createdByStaff: uuid('created_by_staff').references(() => staffUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    nameNonEmpty: check('chk_tournament_name_nonempty', sql`length(trim(${table.name})) > 0`),
    slugFormat: check(
      'chk_tournament_slug_format',
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    dates: check(
      'chk_tournament_dates',
      sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`,
    ),
    deadline: check(
      'chk_tournament_deadline',
      sql`${table.registrationDeadline} IS NULL OR ${table.registrationDeadline} <= ${table.startsOn}`,
    ),
    maxTeamsRange: check(
      'chk_tournament_max_teams',
      sql`${table.maxTeams} IS NULL OR ${table.maxTeams} BETWEEN 2 AND 256`,
    ),
    matchDuration: check(
      'chk_tournament_match_duration',
      sql`${table.matchDurationMinutes} BETWEEN 10 AND 120`,
    ),
    rest: check('chk_tournament_rest', sql`${table.restBetweenMatchesMinutes} BETWEEN 0 AND 240`),
    feeNonNeg: check('chk_tournament_fee_nonneg', sql`${table.inscriptionFee} >= 0`),
    points: check(
      'chk_tournament_points',
      sql`${table.pointsWin} >= ${table.pointsDraw} AND ${table.pointsDraw} >= ${table.pointsLoss} AND ${table.pointsLoss} >= 0`,
    ),
    tiebreakersNonEmpty: check(
      'chk_tournament_tiebreakers',
      sql`cardinality(${table.tiebreakers}) > 0`,
    ),
    yellowLimit: check(
      'chk_tournament_yellow_limit',
      sql`${table.yellowCardsForSuspension} BETWEEN 1 AND 20`,
    ),
    redMatches: check(
      'chk_tournament_red_matches',
      sql`${table.redCardSuspensionMatches} BETWEEN 0 AND 20`,
    ),
    walkover: check('chk_tournament_walkover', sql`${table.walkoverGoalsFor} BETWEEN 0 AND 20`),

    tenantSlugIdx: uniqueIndex('uq_tournaments_tenant_slug').on(table.tenantId, table.slug),
    tenantIdx: index('idx_tournaments_tenant').on(table.tenantId, table.startsOn.desc()),
    tenantStatusIdx: index('idx_tournaments_tenant_status').on(table.tenantId, table.status),
    publicIdx: index('idx_tournaments_public')
      .on(table.tenantId, table.slug)
      .where(sql`is_public`),
  }),
)
