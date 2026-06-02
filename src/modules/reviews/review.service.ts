import { count, desc, eq, sql } from 'drizzle-orm'
import { getDb, type DbTx } from '@/shared/db/client'
import { bookings, reviews } from '@/shared/db/schema'
import { withSpan } from '@/shared/observability'
import {
  ReviewAlreadyExistsError,
  ReviewBookingNotCompletedError,
  ReviewBookingNotFoundError,
} from './review.errors'
import type {
  RatingSummary,
  ReviewRow,
  ReviewsPage,
} from './review.types'

function rowToReviewRow(r: typeof reviews.$inferSelect): ReviewRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    playerId: r.playerId,
    bookingId: r.bookingId,
    rating: r.rating,
    comment: r.comment ?? null,
    createdAt: r.createdAt,
  }
}

// ─── Player write (RLS app.current_player_id; correr dentro de withPlayerContext) ──

/**
 * Crea una reseña para un booking del jugador. Requiere que el booking sea suyo
 * y esté 'completed', y que no exista una reseña previa (uq_reviews_booking).
 * tenant_id se deriva del booking. La policy reviews_player_insert valida lo
 * mismo a nivel DB (defensa en profundidad).
 */
export async function createReview(
  playerId: string,
  bookingId: string,
  rating: number,
  comment: string | null,
  tx: DbTx,
): Promise<ReviewRow> {
  const bk = await tx
    .select({
      tenantId: bookings.tenantId,
      status: bookings.status,
      playerId: bookings.playerId,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  const booking = bk[0]
  if (!booking || booking.playerId !== playerId) {
    throw new ReviewBookingNotFoundError(bookingId)
  }
  if (booking.status !== 'completed') {
    throw new ReviewBookingNotCompletedError()
  }

  const existing = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .limit(1)
  if (existing[0]) {
    throw new ReviewAlreadyExistsError()
  }

  const inserted = await tx
    .insert(reviews)
    .values({
      tenantId: booking.tenantId,
      playerId,
      bookingId,
      rating,
      comment,
    })
    .returning()
  return rowToReviewRow(inserted[0]!)
}

/**
 * True si el jugador puede reseñar el booking: es suyo, está 'completed' y no
 * tiene reseña previa.
 */
export async function canReview(
  playerId: string,
  bookingId: string,
  tx: DbTx,
): Promise<boolean> {
  const bk = await tx
    .select({ status: bookings.status, playerId: bookings.playerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  const booking = bk[0]
  if (!booking || booking.playerId !== playerId || booking.status !== 'completed') {
    return false
  }
  const existing = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.bookingId, bookingId))
    .limit(1)
  return !existing[0]
}

// ─── Public reads (getDb; RLS reviews_public_select USING(true)) ──

export async function getReviewsByTenant(
  tenantId: string,
  limit = 20,
  offset = 0,
): Promise<ReviewsPage> {
  return withSpan('reviews.byTenant', 'db.query.reviews', () =>
    getReviewsByTenantImpl(tenantId, limit, offset),
  )
}

async function getReviewsByTenantImpl(
  tenantId: string,
  limit: number,
  offset: number,
): Promise<ReviewsPage> {
  const db = getDb()
  const lim = Math.min(Math.max(limit, 1), 50)
  const off = Math.max(offset, 0)
  const [rows, countRows] = await Promise.all([
    db
      // Proyección pública: sin playerId/bookingId (UUIDs internos — Ley 25.326).
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(eq(reviews.tenantId, tenantId))
      .orderBy(desc(reviews.createdAt))
      .limit(lim)
      .offset(off),
    db.select({ c: count() }).from(reviews).where(eq(reviews.tenantId, tenantId)),
  ])
  const total = countRows[0]?.c ?? 0
  return {
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment ?? null,
      createdAt: r.createdAt,
    })),
    total,
  }
}

export async function getAverageRating(tenantId: string): Promise<RatingSummary> {
  const db = getDb()
  const rows = await db
    .select({
      average: sql<number>`COALESCE(ROUND(AVG(${reviews.rating})::numeric, 2), 0)::float8`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(reviews)
    .where(eq(reviews.tenantId, tenantId))
  return {
    average: Number(rows[0]?.average ?? 0),
    count: Number(rows[0]?.count ?? 0),
  }
}
