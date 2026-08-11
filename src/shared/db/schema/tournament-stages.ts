import { sql } from 'drizzle-orm'
import {
  check,
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
import { tournaments } from './tournaments'
import { tournamentStageKindEnum } from './enums'

// Migración 064. Fases del torneo: una liga tiene una sola; un grupos+playoffs
// tiene la de zonas y la de llaves, con order_index marcando cuál va primero.
export const tournamentStages = pgTable(
  'tournament_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id),
    name: text('name').notNull(),
    kind: tournamentStageKindEnum('kind').notNull(),
    /** 0 = la primera fase que se juega. */
    orderIndex: integer('order_index').notNull().default(0),
    /** 1 = solo ida, 2 = ida y vuelta. No aplica a knockout. */
    legs: smallint('legs').notNull().default(1),
    /** Solo group_stage. */
    groupsCount: smallint('groups_count'),
    teamsAdvancePerGroup: smallint('teams_advance_per_group'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    nameNonEmpty: check('chk_stage_name_nonempty', sql`length(trim(${table.name})) > 0`),
    legsValid: check('chk_stage_legs', sql`${table.legs} IN (1, 2)`),
    orderNonNeg: check('chk_stage_order', sql`${table.orderIndex} >= 0`),
    groupsRange: check(
      'chk_stage_groups',
      sql`${table.groupsCount} IS NULL OR ${table.groupsCount} BETWEEN 1 AND 16`,
    ),
    advanceRange: check(
      'chk_stage_advance',
      sql`${table.teamsAdvancePerGroup} IS NULL OR ${table.teamsAdvancePerGroup} >= 1`,
    ),
    groupsOnlyOnGroupStage: check(
      'chk_stage_groups_kind',
      sql`${table.kind} = 'group_stage' OR ${table.groupsCount} IS NULL`,
    ),

    orderIdx: uniqueIndex('uq_tournament_stages_order').on(table.tournamentId, table.orderIndex),
    tournamentIdx: index('idx_tournament_stages_tournament').on(table.tournamentId),
    tenantIdx: index('idx_tournament_stages_tenant').on(table.tenantId),
  }),
)
