import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'
import { staffUsers } from './staff-users'

// Fix #9 F2: SIN uq_tenant_player_active_ban (NOW() no es IMMUTABLE).
// El trigger enforce_single_active_ban (005) hace la validación dinámica.
export const tenantPlayerBans = pgTable(
  'tenant_player_bans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    reason: text('reason').notNull(),
    bannedAt: timestamp('banned_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    bannedUntil: timestamp('banned_until', {
      withTimezone: true,
      mode: 'date',
    }),
    bannedBy: uuid('banned_by').references(() => staffUsers.id),
  },
  (table) => ({
    playerIdx: index('idx_tenant_player_bans_player').on(table.playerId),
    activeIdx: index('idx_tenant_player_bans_active').on(
      table.tenantId,
      table.playerId,
      table.bannedUntil,
    ),
  }),
)
