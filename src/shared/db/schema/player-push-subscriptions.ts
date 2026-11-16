import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { players } from './players'

/** Dispositivos del jugador con push (migr. 113). RLS por `app.current_player_id`. */
export const playerPushSubscriptions = pgTable(
  'player_push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    playerIdx: index('idx_player_push_subscriptions_player').on(table.playerId),
  }),
)
