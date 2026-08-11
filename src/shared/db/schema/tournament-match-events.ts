import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { staffUsers } from './staff-users'
import { tournamentMatches } from './tournament-matches'
import { tournamentTeams } from './tournament-teams'
import { tournamentTeamPlayers } from './tournament-team-players'
import { tournamentEventTypeEnum } from './enums'

// Migración 065. El acta del partido: goles y tarjetas.
//
// Append-only: se inserta o se borra, NUNCA se actualiza (no hay policy de
// UPDATE y la 065 se lo revoca a turnogol_app). Corregir un evento es borrarlo
// y cargarlo de nuevo, y eso deja dos filas en audit_logs.
//
// Un evento cuenta si y solo si su partido está en estado final. Borrar el
// resultado congela el acta sin borrarla.
export const tournamentMatchEvents = pgTable(
  'tournament_match_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Denormalizado. La FK compuesta con match_id lo ata al torneo del partido. */
    tournamentId: uuid('tournament_id').notNull(),
    matchId: uuid('match_id').notNull(),
    /** Equipo del AUTOR. En own_goal el gol suma al RIVAL (ver scoringTeamId). */
    teamId: uuid('team_id').notNull(),
    /** NULL = gol sin autor identificado. Las tarjetas sí exigen autor. */
    teamPlayerId: uuid('team_player_id'),
    type: tournamentEventTypeEnum('type').notNull(),
    minute: smallint('minute'),
    /** Override del tribunal para ESTA roja (0 = indulto). Solo en red_card. */
    suspensionMatches: smallint('suspension_matches'),
    notes: text('notes'),
    createdByStaff: uuid('created_by_staff').references(() => staffUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    // Sin updatedAt a propósito: la fila no se edita nunca.
  },
  (table) => ({
    matchFk: foreignKey({
      name: 'fk_event_match',
      columns: [table.matchId, table.tournamentId],
      foreignColumns: [tournamentMatches.id, tournamentMatches.tournamentId],
    }),
    teamFk: foreignKey({
      name: 'fk_event_team',
      columns: [table.teamId, table.tournamentId],
      foreignColumns: [tournamentTeams.id, tournamentTeams.tournamentId],
    }),
    // MATCH SIMPLE: con teamPlayerId NULL la FK no se chequea.
    playerFk: foreignKey({
      name: 'fk_event_player',
      columns: [table.teamPlayerId, table.teamId],
      foreignColumns: [tournamentTeamPlayers.id, tournamentTeamPlayers.teamId],
    }),

    minuteRange: check(
      'chk_event_minute',
      sql`${table.minute} IS NULL OR ${table.minute} BETWEEN 0 AND 200`,
    ),
    cardNeedsPlayer: check(
      'chk_event_card_needs_player',
      sql`${table.type} IN ('goal', 'own_goal') OR ${table.teamPlayerId} IS NOT NULL`,
    ),
    suspensionOnlyRed: check(
      'chk_event_suspension_only_red',
      sql`${table.suspensionMatches} IS NULL OR ${table.type} = 'red_card'`,
    ),
    suspensionRange: check(
      'chk_event_suspension_range',
      sql`${table.suspensionMatches} IS NULL OR ${table.suspensionMatches} BETWEEN 0 AND 20`,
    ),

    tenantIdx: index('idx_tournament_match_events_tenant').on(table.tenantId),
    matchIdx: index('idx_tournament_match_events_match').on(table.matchId),
    tournamentIdx: index('idx_tournament_match_events_tournament').on(
      table.tournamentId,
      table.type,
    ),
    teamIdx: index('idx_tournament_match_events_team').on(table.teamId),
    playerIdx: index('idx_tournament_match_events_player')
      .on(table.teamPlayerId)
      .where(sql`team_player_id IS NOT NULL`),

    // La 2da amarilla del partido ES una roja: cargarla como amarilla la
    // contaría dos veces en el acumulado.
    oneYellow: uniqueIndex('uq_tournament_match_events_one_yellow')
      .on(table.matchId, table.teamPlayerId)
      .where(sql`type = 'yellow_card'`),
    oneRed: uniqueIndex('uq_tournament_match_events_one_red')
      .on(table.matchId, table.teamPlayerId)
      .where(sql`type = 'red_card'`),
  }),
)
