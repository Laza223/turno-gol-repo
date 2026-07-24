import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'
import { tournaments } from './tournaments'
import { tournamentTeamStatusEnum } from './enums'

// Migración 062. Equipos inscriptos en un torneo.
//
// contactPlayerId es OPCIONAL a propósito: vincular al capitán con una cuenta
// real es lo único que de verdad rinde del CRM de Jugadores (historial,
// contacto, avisos), y exigirlo trabaría el alta el sábado a la mañana.
export const tournamentTeams = pgTable(
  'tournament_teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    name: text('name').notNull(),

    contactPlayerId: uuid('contact_player_id').references(() => players.id),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),

    status: tournamentTeamStatusEnum('status').notNull().default('registered'),
    /** Zona: 'A', 'B', … Se puebla al sortear los grupos (migr. 063). */
    groupLabel: text('group_label'),
    /** Siembra para el sorteo. */
    seed: integer('seed'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameNonEmpty: check(
      'chk_team_name_nonempty',
      sql`length(trim(${table.name})) > 0`,
    ),
    seedPositive: check(
      'chk_team_seed_positive',
      sql`${table.seed} IS NULL OR ${table.seed} > 0`,
    ),
    groupLabelNonEmpty: check(
      'chk_team_group_label',
      sql`${table.groupLabel} IS NULL OR length(trim(${table.groupLabel})) > 0`,
    ),

    // Case-insensitive: "Los Pibes" y "los pibes" son el mismo equipo.
    nameIdx: uniqueIndex('uq_tournament_teams_name').on(
      table.tournamentId,
      sql`lower(trim(${table.name}))`,
    ),
    tournamentIdx: index('idx_tournament_teams_tournament').on(
      table.tournamentId,
      table.status,
    ),
    tenantIdx: index('idx_tournament_teams_tenant').on(table.tenantId),
    playerIdx: index('idx_tournament_teams_player')
      .on(table.contactPlayerId)
      .where(sql`contact_player_id IS NOT NULL`),
  }),
)
