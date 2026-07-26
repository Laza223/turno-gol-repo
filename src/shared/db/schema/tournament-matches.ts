import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { courts } from './courts'
import { bookings } from './bookings'
import { tournaments } from './tournaments'
import { tournamentStages } from './tournament-stages'
import { tournamentTeams } from './tournament-teams'
import { tournamentMatchStatusEnum } from './enums'

// Migración 064. El partido.
//
// NO reserva nada: `bookingId` apunta a la hora que el torneo YA posee y que lo
// contiene, y `startsAt` es el instante propio del partido dentro de esa hora.
// Ese desacople es lo que permite dos partidos de 25 min en un turno de 60.
export const tournamentMatches = pgTable(
  'tournament_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => tournamentStages.id),

    /** Fecha (liga) o ronda (llaves). */
    round: integer('round').notNull(),
    groupLabel: text('group_label'),
    /** Posición dentro de la ronda, para dibujar el cuadro. */
    bracketSlot: integer('bracket_slot'),

    homeTeamId: uuid('home_team_id').references(() => tournamentTeams.id),
    awayTeamId: uuid('away_team_id').references(() => tournamentTeams.id),
    /**
     * Avance automático: de qué partido sale este participante. Autorreferencia,
     * por eso el `AnyPgColumn` (Drizzle no puede inferir el tipo en un ciclo).
     */
    homeSourceMatchId: uuid('home_source_match_id').references(
      (): AnyPgColumn => tournamentMatches.id,
    ),
    awaySourceMatchId: uuid('away_source_match_id').references(
      (): AnyPgColumn => tournamentMatches.id,
    ),
    /** Los source apuntan a las semis, pero se leen como PERDEDOR. */
    isThirdPlace: boolean('is_third_place').notNull().default(false),

    courtId: uuid('court_id').references(() => courts.id),
    /**
     * La hora del torneo que contiene al partido. ON DELETE SET NULL en SQL:
     * liberar horas no puede borrar partidos ni dejar la FK colgada.
     */
    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),

    status: tournamentMatchStatusEnum('status').notNull().default('scheduled'),
    homeScore: smallint('home_score'),
    awayScore: smallint('away_score'),
    /** Definición por penales (migr. 065). NO suma a goles a favor/en contra. */
    homePenalties: smallint('home_penalties'),
    awayPenalties: smallint('away_penalties'),
    /**
     * Migr. 065. NULL con status='walkover' = no se presentó ninguno de los
     * dos. El resultado de un walkover nunca se infiere del marcador: con
     * walkover_goals_for = 0 sería un 0-0 y se leería como empate.
     */
    walkoverWinnerTeamId: uuid('walkover_winner_team_id').references(
      () => tournamentTeams.id,
    ),
    /**
     * Migr. 065. De qué PUESTO de zona sale cada lado del cuadro (1-based).
     * Lo escribe generateFixture; lo consume seedPlayoffs.
     */
    homeSourceSeed: smallint('home_source_seed'),
    awaySourceSeed: smallint('away_source_seed'),
    playedAt: timestamp('played_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roundPositive: check('chk_match_round_positive', sql`${table.round} >= 1`),
    teamsDistinct: check(
      'chk_match_teams_distinct',
      sql`${table.homeTeamId} IS NULL OR ${table.awayTeamId} IS NULL OR ${table.homeTeamId} <> ${table.awayTeamId}`,
    ),
    sourceNotSelf: check(
      'chk_match_source_not_self',
      sql`(${table.homeSourceMatchId} IS NULL OR ${table.homeSourceMatchId} <> ${table.id}) AND (${table.awaySourceMatchId} IS NULL OR ${table.awaySourceMatchId} <> ${table.id})`,
    ),
    // Migr. 065 los redefinió: un lado tiene UN SOLO mecanismo de alimentación
    // (partido anterior XOR puesto de zona). El *_team_id es el valor ya
    // resuelto y convive con su origen — sin eso el avance de llaves es
    // imposible. schema-drift NO compara constraints, así que dejar acá la
    // versión vieja sería drift silencioso.
    homeOrigin: check(
      'chk_match_home_origin',
      sql`${table.homeSourceMatchId} IS NULL OR ${table.homeSourceSeed} IS NULL`,
    ),
    awayOrigin: check(
      'chk_match_away_origin',
      sql`${table.awaySourceMatchId} IS NULL OR ${table.awaySourceSeed} IS NULL`,
    ),
    sourceSeedPositive: check(
      'chk_match_source_seed_positive',
      sql`(${table.homeSourceSeed} IS NULL OR ${table.homeSourceSeed} >= 1) AND (${table.awaySourceSeed} IS NULL OR ${table.awaySourceSeed} >= 1)`,
    ),
    walkoverHasScore: check(
      'chk_match_walkover_has_score',
      sql`${table.status} <> 'walkover' OR (${table.homeScore} IS NOT NULL AND ${table.awayScore} IS NOT NULL)`,
    ),
    walkoverWinner: check(
      'chk_match_walkover_winner',
      sql`${table.walkoverWinnerTeamId} IS NULL OR (${table.status} = 'walkover' AND (${table.walkoverWinnerTeamId} = ${table.homeTeamId} OR ${table.walkoverWinnerTeamId} = ${table.awayTeamId}))`,
    ),
    penaltiesPair: check(
      'chk_match_penalties_pair',
      sql`(${table.homePenalties} IS NULL) = (${table.awayPenalties} IS NULL)`,
    ),
    penaltiesNonNeg: check(
      'chk_match_penalties_nonneg',
      sql`${table.homePenalties} IS NULL OR (${table.homePenalties} >= 0 AND ${table.awayPenalties} >= 0)`,
    ),
    penaltiesOnDraw: check(
      'chk_match_penalties_on_draw',
      sql`${table.homePenalties} IS NULL OR (${table.status} = 'played' AND ${table.homeScore} IS NOT NULL AND ${table.homeScore} = ${table.awayScore})`,
    ),
    penaltiesDistinct: check(
      'chk_match_penalties_distinct',
      sql`${table.homePenalties} IS NULL OR ${table.homePenalties} <> ${table.awayPenalties}`,
    ),
    scorePair: check(
      'chk_match_score_pair',
      sql`(${table.homeScore} IS NULL) = (${table.awayScore} IS NULL)`,
    ),
    scoreNonNeg: check(
      'chk_match_score_nonneg',
      sql`(${table.homeScore} IS NULL OR ${table.homeScore} >= 0) AND (${table.awayScore} IS NULL OR ${table.awayScore} >= 0)`,
    ),
    playedHasScore: check(
      'chk_match_played_has_score',
      sql`${table.status} <> 'played' OR (${table.homeScore} IS NOT NULL AND ${table.awayScore} IS NOT NULL)`,
    ),
    schedulePair: check(
      'chk_match_schedule_pair',
      sql`(${table.startsAt} IS NULL) = (${table.endsAt} IS NULL)`,
    ),
    scheduleOrder: check(
      'chk_match_schedule_order',
      sql`${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),

    tournamentIdx: index('idx_tournament_matches_tournament').on(
      table.tournamentId,
      table.round,
    ),
    stageIdx: index('idx_tournament_matches_stage').on(
      table.stageId,
      table.round,
      table.bracketSlot,
    ),
    tenantIdx: index('idx_tournament_matches_tenant').on(table.tenantId),
    bookingIdx: index('idx_tournament_matches_booking')
      .on(table.bookingId)
      .where(sql`booking_id IS NOT NULL`),
    startsIdx: index('idx_tournament_matches_starts')
      .on(table.tenantId, table.startsAt)
      .where(sql`starts_at IS NOT NULL`),
    homeTeamIdx: index('idx_tournament_matches_home_team')
      .on(table.homeTeamId)
      .where(sql`home_team_id IS NOT NULL`),
    awayTeamIdx: index('idx_tournament_matches_away_team')
      .on(table.awayTeamId)
      .where(sql`away_team_id IS NOT NULL`),

    // Migr. 065: clave candidata para la FK compuesta del acta. Redundante con
    // la PK, pero Postgres exige un UNIQUE sobre las columnas exactas.
    idTournamentUq: unique('uq_tournament_matches_id_tournament').on(
      table.id,
      table.tournamentId,
    ),
  }),
)
