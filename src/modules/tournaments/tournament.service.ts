import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { tournaments } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { tournamentSlugBase } from './tournament-slug'
import { countTournamentBookings } from './tournament-slots.service'
import {
  TournamentHasBookingsError,
  TournamentNotDeletableError,
  TournamentNotFoundError,
} from './tournament.errors'
import type {
  CreateTournamentInput,
  Tiebreaker,
  TournamentRow,
  TournamentStatus,
  UpdateTournamentInput,
} from './tournament.types'

function rowToTournament(r: typeof tournaments.$inferSelect): TournamentRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    slug: r.slug,
    format: r.format,
    status: r.status,
    startsOn: r.startsOn,
    endsOn: r.endsOn ?? null,
    registrationDeadline: r.registrationDeadline ?? null,
    maxTeams: r.maxTeams ?? null,
    matchDurationMinutes: r.matchDurationMinutes,
    restBetweenMatchesMinutes: r.restBetweenMatchesMinutes,
    inscriptionFee: r.inscriptionFee,
    pointsWin: r.pointsWin,
    pointsDraw: r.pointsDraw,
    pointsLoss: r.pointsLoss,
    tiebreakers: r.tiebreakers as Tiebreaker[],
    yellowCardsForSuspension: r.yellowCardsForSuspension,
    redCardSuspensionMatches: r.redCardSuspensionMatches,
    walkoverGoalsFor: r.walkoverGoalsFor,
    isPublic: r.isPublic,
    notes: r.notes ?? null,
    createdByStaff: r.createdByStaff ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/**
 * Slug único dentro del complejo. La base sale de `tournamentSlugBase` (que
 * reusa el mismo `generateSlug` del slug público del complejo) y se desambigua
 * con sufijo numérico.
 */
async function uniqueSlug(
  tenantId: string,
  name: string,
  tx: DbTx,
): Promise<string> {
  const base = tournamentSlugBase(name)
  const taken = (await tx.execute(sql`
    SELECT slug FROM tournaments
    WHERE tenant_id = ${tenantId} AND (slug = ${base} OR slug LIKE ${`${base}-%`})
  `)) as unknown as Array<{ slug: string }>
  if (taken.length === 0) return base

  const used = new Set(taken.map((t) => t.slug))
  if (!used.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!used.has(candidate)) return candidate
  }
  // Inalcanzable en la práctica; mejor un slug feo que un throw.
  return `${base}-${Date.now()}`
}

export async function listTournaments(
  tenantId: string,
  tx: DbTx,
  opts: { status?: TournamentStatus } = {},
): Promise<TournamentRow[]> {
  // Filtro explícito por tenant_id ADEMÁS de RLS (defensa en profundidad: en
  // dev el pool conecta como superusuario y RLS no aplica).
  const where = opts.status
    ? and(eq(tournaments.tenantId, tenantId), eq(tournaments.status, opts.status))
    : eq(tournaments.tenantId, tenantId)

  const rows = await tx
    .select()
    .from(tournaments)
    .where(where)
    .orderBy(desc(tournaments.startsOn), asc(tournaments.name))
  return rows.map(rowToTournament)
}

export async function getTournament(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<TournamentRow> {
  const rows = await tx
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.tenantId, tenantId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new TournamentNotFoundError(tournamentId)
  return rowToTournament(row)
}

export async function createTournament(
  tenantId: string,
  staffUserId: string,
  input: CreateTournamentInput,
  tx: DbTx,
): Promise<TournamentRow> {
  const slug = await uniqueSlug(tenantId, input.name, tx)

  const inserted = await tx
    .insert(tournaments)
    .values({
      tenantId,
      name: input.name.trim(),
      slug,
      format: input.format,
      status: 'draft',
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      registrationDeadline: input.registrationDeadline ?? null,
      maxTeams: input.maxTeams ?? null,
      matchDurationMinutes: input.matchDurationMinutes ?? 60,
      restBetweenMatchesMinutes: input.restBetweenMatchesMinutes ?? 0,
      inscriptionFee: input.inscriptionFee ?? 0,
      pointsWin: input.pointsWin ?? 3,
      pointsDraw: input.pointsDraw ?? 1,
      pointsLoss: input.pointsLoss ?? 0,
      ...(input.tiebreakers ? { tiebreakers: input.tiebreakers } : {}),
      yellowCardsForSuspension: input.yellowCardsForSuspension ?? 3,
      redCardSuspensionMatches: input.redCardSuspensionMatches ?? 1,
      walkoverGoalsFor: input.walkoverGoalsFor ?? 3,
      notes: input.notes ?? null,
      createdByStaff: staffUserId,
    })
    .returning()

  const row = inserted[0]!
  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.created',
    resourceType: 'tournament',
    resourceId: row.id,
    metadata: { name: row.name, format: row.format, startsOn: row.startsOn },
  })
  return rowToTournament(row)
}

export async function updateTournament(
  tenantId: string,
  staffUserId: string,
  input: UpdateTournamentInput & { id: string },
  tx: DbTx,
): Promise<TournamentRow> {
  // Confirma pertenencia al complejo antes de tocar nada.
  await getTournament(tenantId, input.id, tx)

  const patch: Partial<typeof tournaments.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.endsOn !== undefined) patch.endsOn = input.endsOn
  if (input.registrationDeadline !== undefined)
    patch.registrationDeadline = input.registrationDeadline
  if (input.maxTeams !== undefined) patch.maxTeams = input.maxTeams
  if (input.matchDurationMinutes !== undefined)
    patch.matchDurationMinutes = input.matchDurationMinutes
  if (input.restBetweenMatchesMinutes !== undefined)
    patch.restBetweenMatchesMinutes = input.restBetweenMatchesMinutes
  if (input.inscriptionFee !== undefined) patch.inscriptionFee = input.inscriptionFee
  if (input.pointsWin !== undefined) patch.pointsWin = input.pointsWin
  if (input.pointsDraw !== undefined) patch.pointsDraw = input.pointsDraw
  if (input.pointsLoss !== undefined) patch.pointsLoss = input.pointsLoss
  if (input.tiebreakers !== undefined) patch.tiebreakers = input.tiebreakers
  if (input.yellowCardsForSuspension !== undefined)
    patch.yellowCardsForSuspension = input.yellowCardsForSuspension
  if (input.redCardSuspensionMatches !== undefined)
    patch.redCardSuspensionMatches = input.redCardSuspensionMatches
  if (input.walkoverGoalsFor !== undefined)
    patch.walkoverGoalsFor = input.walkoverGoalsFor
  if (input.status !== undefined) patch.status = input.status
  if (input.isPublic !== undefined) patch.isPublic = input.isPublic
  if (input.notes !== undefined) patch.notes = input.notes

  // El nombre NO regenera el slug: la URL pública ya puede estar compartida.

  if (Object.keys(patch).length === 0) return getTournament(tenantId, input.id, tx)

  const updated = await tx
    .update(tournaments)
    .set(patch)
    .where(and(eq(tournaments.id, input.id), eq(tournaments.tenantId, tenantId)))
    .returning()

  const row = updated[0]
  if (!row) throw new TournamentNotFoundError(input.id)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.updated',
    resourceType: 'tournament',
    resourceId: row.id,
    metadata: { fields: Object.keys(patch) },
  })
  return rowToTournament(row)
}

/**
 * Borrado real, solo en 'draft'. Un torneo que ya arrancó se cancela
 * (status 'canceled'), no se borra: hay historial colgando.
 */
export async function deleteTournament(
  tenantId: string,
  staffUserId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<void> {
  const tournament = await getTournament(tenantId, tournamentId, tx)
  if (tournament.status !== 'draft') {
    throw new TournamentNotDeletableError(tournament.status)
  }

  // La FK de bookings.tournament_id frenaría el DELETE igual, pero con un 23503
  // crudo; este chequeo da un mensaje que dice qué hacer.
  const owned = await countTournamentBookings(tenantId, tournamentId, tx)
  if (owned > 0) throw new TournamentHasBookingsError(owned)

  await tx
    .delete(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.tenantId, tenantId)))

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.deleted',
    resourceType: 'tournament',
    resourceId: tournamentId,
    metadata: { name: tournament.name },
  })
}
