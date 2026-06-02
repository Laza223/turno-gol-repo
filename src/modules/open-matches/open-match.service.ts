import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, type DbTx } from '@/shared/db/client'
import { bookings, openMatches, openMatchPlayers, tenants } from '@/shared/db/schema'
import { withSpan } from '@/shared/observability'
import {
  OpenMatchAlreadyExistsError,
  OpenMatchAlreadyJoinedError,
  OpenMatchBookingNotConfirmedError,
  OpenMatchBookingNotFoundError,
  OpenMatchCannotJoinOwnError,
  OpenMatchNotCancelableError,
  OpenMatchNotFoundError,
  OpenMatchNotJoinableError,
  OpenMatchNotOwnerError,
} from './open-match.errors'
import type {
  OpenMatchesPage,
  OpenMatchFilters,
  OpenMatchRestrictions,
  OpenMatchRow,
} from './open-match.types'

const ACTIVE: ('open' | 'full')[] = ['open', 'full']

function rowToOpenMatchRow(r: typeof openMatches.$inferSelect): OpenMatchRow {
  return {
    id: r.id,
    bookingId: r.bookingId,
    creatorPlayerId: r.creatorPlayerId,
    tenantId: r.tenantId,
    slotsTotal: r.slotsTotal,
    slotsFilled: r.slotsFilled,
    restrictions: (r.restrictions ?? {}) as OpenMatchRestrictions,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt ?? null,
  }
}

// ─── Player writes (RLS app.current_player_id; dentro de withPlayerContext) ──

/**
 * Crea un partido abierto desde una reserva confirmada del jugador. tenant_id y
 * expires_at (= horario de inicio del partido) se derivan del booking. La policy
 * open_matches_creator_insert valida creador + booking propio a nivel DB.
 */
export async function createOpenMatch(
  playerId: string,
  bookingId: string,
  slotsTotal: number,
  restrictions: OpenMatchRestrictions | null,
  tx: DbTx,
): Promise<OpenMatchRow> {
  const bk = await tx
    .select({
      tenantId: bookings.tenantId,
      status: bookings.status,
      ownerId: bookings.playerId,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  const booking = bk[0]
  if (!booking || booking.ownerId !== playerId) {
    throw new OpenMatchBookingNotFoundError(bookingId)
  }
  if (booking.status !== 'confirmed') {
    throw new OpenMatchBookingNotConfirmedError()
  }

  const active = await tx
    .select({ id: openMatches.id })
    .from(openMatches)
    .where(and(eq(openMatches.bookingId, bookingId), inArray(openMatches.status, ACTIVE)))
    .limit(1)
  if (active[0]) {
    throw new OpenMatchAlreadyExistsError()
  }

  let inserted: (typeof openMatches.$inferSelect)[]
  try {
    inserted = await tx
      .insert(openMatches)
      .values({
        bookingId,
        creatorPlayerId: playerId,
        tenantId: booking.tenantId,
        slotsTotal,
        restrictions: (restrictions ?? {}) as Record<string, unknown>,
        // expires_at = inicio del partido (no se puede sumar gente después).
        expiresAt: sql`(
          SELECT (b.date + b.time_start) AT TIME ZONE t.timezone
          FROM bookings b JOIN tenants t ON t.id = b.tenant_id
          WHERE b.id = ${bookingId}
        )` as unknown as Date,
      })
      .returning()
  } catch (e) {
    // Carrera con uq_open_match_active_booking: el chequeo previo no es atómico.
    if ((e as { code?: string }).code === '23505') {
      throw new OpenMatchAlreadyExistsError()
    }
    throw e
  }
  return rowToOpenMatchRow(inserted[0]!)
}

/**
 * Anota al jugador en un partido abierto. La validación de estado/cupo/expiración
 * es atómica vía el trigger enforce_open_match_join (FOR UPDATE); slots_filled y
 * la transición open→full las mantiene sync_open_match_slots.
 */
export async function joinMatch(
  playerId: string,
  matchId: string,
  tx: DbTx,
): Promise<OpenMatchRow> {
  const m = await tx
    .select({ creatorPlayerId: openMatches.creatorPlayerId })
    .from(openMatches)
    .where(eq(openMatches.id, matchId))
    .limit(1)
  if (!m[0]) {
    throw new OpenMatchNotFoundError(matchId)
  }
  if (m[0].creatorPlayerId === playerId) {
    throw new OpenMatchCannotJoinOwnError()
  }

  try {
    await tx.insert(openMatchPlayers).values({ openMatchId: matchId, playerId })
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === '23505') throw new OpenMatchAlreadyJoinedError()
    if (code === '23503') throw new OpenMatchNotFoundError(matchId)
    if (code === '23514') {
      throw new OpenMatchNotJoinableError(
        (e as Error).message || 'No te podés sumar a este partido.',
      )
    }
    throw e
  }

  const updated = await tx
    .select()
    .from(openMatches)
    .where(eq(openMatches.id, matchId))
    .limit(1)
  return rowToOpenMatchRow(updated[0]!)
}

/**
 * Cancela un partido abierto (solo el creador, solo si está open/full).
 */
export async function cancelMatch(
  playerId: string,
  matchId: string,
  tx: DbTx,
): Promise<OpenMatchRow> {
  const m = await tx
    .select({
      creatorPlayerId: openMatches.creatorPlayerId,
      status: openMatches.status,
    })
    .from(openMatches)
    .where(eq(openMatches.id, matchId))
    .limit(1)
  if (!m[0]) {
    throw new OpenMatchNotFoundError(matchId)
  }
  if (m[0].creatorPlayerId !== playerId) {
    throw new OpenMatchNotOwnerError()
  }
  if (m[0].status !== 'open' && m[0].status !== 'full') {
    throw new OpenMatchNotCancelableError()
  }

  const updated = await tx
    .update(openMatches)
    .set({ status: 'canceled' })
    .where(eq(openMatches.id, matchId))
    .returning()
  return rowToOpenMatchRow(updated[0]!)
}

// ─── Public read (getDb; RLS open_matches_public_select USING(true)) ──

export async function getOpenMatches(
  filters: OpenMatchFilters,
): Promise<OpenMatchesPage> {
  return withSpan('openMatches.list', 'db.query.open_matches', () =>
    getOpenMatchesImpl(filters),
  )
}

async function getOpenMatchesImpl(
  filters: OpenMatchFilters,
): Promise<OpenMatchesPage> {
  const db = getDb()
  const status = filters.status ?? 'open'
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50)
  const offset = Math.max(filters.offset ?? 0, 0)

  const conds = [eq(openMatches.status, status)]
  if (filters.tenantId) conds.push(eq(openMatches.tenantId, filters.tenantId))
  if (filters.city) conds.push(eq(tenants.city, filters.city))
  if (filters.province) conds.push(eq(tenants.province, filters.province))
  // Los partidos 'open' que ya arrancaron no se muestran en la vitrina.
  if (status === 'open') {
    conds.push(sql`(${openMatches.expiresAt} IS NULL OR ${openMatches.expiresAt} > now())`)
  }
  const where = and(...conds)

  const [rows, countRows] = await Promise.all([
    db
      // Proyección pública: sin creatorPlayerId/bookingId (UUIDs internos — Ley 25.326).
      .select({
        id: openMatches.id,
        tenantId: openMatches.tenantId,
        slotsTotal: openMatches.slotsTotal,
        slotsFilled: openMatches.slotsFilled,
        restrictions: openMatches.restrictions,
        status: openMatches.status,
        createdAt: openMatches.createdAt,
        expiresAt: openMatches.expiresAt,
        tSlug: tenants.slug,
        tName: tenants.name,
        tCity: tenants.city,
        tProvince: tenants.province,
        tLogo: tenants.logoUrl,
      })
      .from(openMatches)
      .innerJoin(tenants, eq(tenants.id, openMatches.tenantId))
      .where(where)
      .orderBy(sql`${openMatches.expiresAt} ASC NULLS LAST`, desc(openMatches.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ c: count() })
      .from(openMatches)
      .innerJoin(tenants, eq(tenants.id, openMatches.tenantId))
      .where(where),
  ])

  const matches = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    slotsTotal: r.slotsTotal,
    slotsFilled: r.slotsFilled,
    restrictions: (r.restrictions ?? {}) as OpenMatchRestrictions,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt ?? null,
    slotsRemaining: Math.max(r.slotsTotal - r.slotsFilled, 0),
    tenant: {
      slug: r.tSlug,
      name: r.tName,
      city: r.tCity,
      province: r.tProvince,
      logoUrl: r.tLogo ?? null,
    },
  }))
  return { matches, total: countRows[0]?.c ?? 0 }
}
