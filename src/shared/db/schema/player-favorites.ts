import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { players } from './players'

// Complejos favoritos del jugador (❤️). Cross-tenant: un jugador marca N complejos.
// UNIQUE(player_id, tenant_id). RLS: el jugador solo ve/modifica los suyos
// (app.current_player_id). NO hay lectura pública (ver 017_player_favorites.sql).
export const playerFavorites = pgTable(
  'player_favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    playerTenantUnique: uniqueIndex('uq_player_favorites_player_tenant').on(
      table.playerId,
      table.tenantId,
    ),
    playerIdx: index('idx_player_favorites_player').on(table.playerId),
    tenantIdx: index('idx_player_favorites_tenant').on(table.tenantId),
  }),
)
