import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { bookings } from './bookings'
import { players } from './players'

/** Dispositivos del jugador con push (migr. 114). RLS por `app.current_player_id`. */
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

/**
 * Dedupe de los recordatorios al jugador (migr. 114): una fila por turno, tipo e
 * inicio. Del sistema: RLS sin policies y sin permisos para la app; la escribe
 * solo el worker `player-reminders` (BYPASSRLS).
 */
export const playerReminderSends = pgTable(
  'player_reminder_sends',
  {
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.bookingId, table.kind, table.startsAt] })],
)
