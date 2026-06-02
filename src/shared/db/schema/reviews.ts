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
import { bookings } from './bookings'

// Reseñas de jugadores post-partido (interfaz pública estilo ATC).
// tenant_id está denormalizado desde el booking para listados públicos rápidos.
// rating 1-5, comment opcional (máx 500). 1 review por booking (uq booking_id).
// RLS: lectura pública (perfil del complejo); INSERT solo el jugador dueño de un
// booking 'completed' (ver 016_reviews.sql).
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ratingCheck: check(
      'chk_review_rating_range',
      sql`${table.rating} BETWEEN 1 AND 5`,
    ),
    commentLenCheck: check(
      'chk_review_comment_length',
      sql`${table.comment} IS NULL OR char_length(${table.comment}) <= 500`,
    ),
    bookingUnique: uniqueIndex('uq_reviews_booking').on(table.bookingId),
    tenantCreatedIdx: index('idx_reviews_tenant_created').on(
      table.tenantId,
      table.createdAt,
    ),
    playerIdx: index('idx_reviews_player').on(table.playerId),
  }),
)
