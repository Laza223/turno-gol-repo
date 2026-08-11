import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'
import { tournamentTeams } from './tournament-teams'

// Migración 062. Plantel de un equipo.
//
// fullName es la fuente de verdad; playerId es el enganche opcional con una
// cuenta real de TurnoGol. Ningún torneo amateur arranca si hay que registrar
// 100 personas antes de la primera fecha.
export const tournamentTeamPlayers = pgTable(
  'tournament_team_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => tournamentTeams.id),

    fullName: text('full_name').notNull(),
    playerId: uuid('player_id').references(() => players.id),
    dni: text('dni'),
    shirtNumber: smallint('shirt_number'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    nameNonEmpty: check('chk_team_player_name_nonempty', sql`length(trim(${table.fullName})) > 0`),
    shirtRange: check(
      'chk_team_player_shirt',
      sql`${table.shirtNumber} IS NULL OR ${table.shirtNumber} BETWEEN 0 AND 999`,
    ),

    teamIdx: index('idx_tournament_team_players_team').on(table.teamId),
    tenantIdx: index('idx_tournament_team_players_tenant').on(table.tenantId),
    playerIdx: index('idx_tournament_team_players_player')
      .on(table.playerId)
      .where(sql`player_id IS NOT NULL`),
    // Un número de camiseta no se repite dentro del equipo (si se carga).
    shirtIdx: uniqueIndex('uq_tournament_team_players_shirt')
      .on(table.teamId, table.shirtNumber)
      .where(sql`shirt_number IS NOT NULL`),

    // Migr. 065: clave candidata para la FK compuesta del acta — garantiza que
    // el goleador pertenece al equipo al que se le carga el gol.
    idTeamUq: unique('uq_tournament_team_players_id_team').on(table.id, table.teamId),
  }),
)
