import { and, asc, eq, sql } from 'drizzle-orm'
import { tournamentTeamPlayers, tournamentTeams } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { getTournament } from './tournament.service'
import {
  DuplicateShirtNumberError,
  DuplicateTeamNameError,
  TournamentFullError,
  TournamentTeamNotFoundError,
} from './tournament.errors'
import type {
  CreateTeamInput,
  CreateTeamPlayerInput,
  TournamentTeamPlayerRow,
  TournamentTeamRow,
  UpdateTeamInput,
} from './tournament.types'

const PG_UNIQUE_VIOLATION = '23505'

type PgErrorLike = { code?: string; constraint_name?: string; constraint?: string }

/**
 * Desenvuelve el error de Postgres.
 *
 * Drizzle 0.45 envuelve lo que tira postgres-js en un `DrizzleQueryError`: el
 * `code` y el `constraint_name` viajan en `cause`, NO en el error de arriba.
 * Mirar solo el nivel superior hace que un 23505 se escape crudo hacia la UI
 * en vez de convertirse en un error de dominio con mensaje útil.
 */
function asPgError(err: unknown): PgErrorLike | null {
  let current: unknown = err
  // Tope de saltos: la cadena de `cause` es corta y no queremos un ciclo.
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === 'object' && 'code' in current) {
      const code = (current as { code?: unknown }).code
      if (typeof code === 'string') return current as PgErrorLike
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/** Exportada para test unitario: sin esto solo se cubre con DB real. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pg = asPgError(err)
  if (!pg || pg.code !== PG_UNIQUE_VIOLATION) return false
  return String(pg.constraint_name ?? pg.constraint ?? '').includes(constraint)
}

function rowToTeam(r: typeof tournamentTeams.$inferSelect): TournamentTeamRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tournamentId: r.tournamentId,
    name: r.name,
    contactPlayerId: r.contactPlayerId ?? null,
    contactName: r.contactName ?? null,
    contactPhone: r.contactPhone ?? null,
    status: r.status,
    groupLabel: r.groupLabel ?? null,
    seed: r.seed ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function rowToTeamPlayer(
  r: typeof tournamentTeamPlayers.$inferSelect,
): TournamentTeamPlayerRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    teamId: r.teamId,
    fullName: r.fullName,
    playerId: r.playerId ?? null,
    dni: r.dni ?? null,
    shirtNumber: r.shirtNumber ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export async function listTeams(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<TournamentTeamRow[]> {
  const rows = await tx
    .select()
    .from(tournamentTeams)
    .where(
      and(
        eq(tournamentTeams.tenantId, tenantId),
        eq(tournamentTeams.tournamentId, tournamentId),
      ),
    )
    .orderBy(asc(tournamentTeams.groupLabel), asc(tournamentTeams.name))
  return rows.map(rowToTeam)
}

export async function getTeam(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<TournamentTeamRow> {
  const rows = await tx
    .select()
    .from(tournamentTeams)
    .where(and(eq(tournamentTeams.id, teamId), eq(tournamentTeams.tenantId, tenantId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new TournamentTeamNotFoundError(teamId)
  return rowToTeam(row)
}

/**
 * Inscribe un equipo. Respeta el cupo (`maxTeams`) contando solo los equipos
 * que siguen en carrera: uno que se bajó libera su lugar.
 */
export async function addTeam(
  tenantId: string,
  staffUserId: string,
  tournamentId: string,
  input: CreateTeamInput,
  tx: DbTx,
): Promise<TournamentTeamRow> {
  const tournament = await getTournament(tenantId, tournamentId, tx)

  if (tournament.maxTeams !== null) {
    const counted = (await tx.execute(sql`
      SELECT count(*)::int AS "count"
      FROM tournament_teams
      WHERE tenant_id = ${tenantId}
        AND tournament_id = ${tournamentId}
        AND status IN ('registered', 'confirmed')
    `)) as unknown as Array<{ count: number }>
    if ((counted[0]?.count ?? 0) >= tournament.maxTeams) {
      throw new TournamentFullError(tournament.maxTeams)
    }
  }

  try {
    const inserted = await tx
      .insert(tournamentTeams)
      .values({
        tenantId,
        tournamentId,
        name: input.name.trim(),
        contactPlayerId: input.contactPlayerId ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        notes: input.notes ?? null,
      })
      .returning()

    const row = inserted[0]!
    await insertAuditLog(tx, {
      tenantId,
      actorId: staffUserId,
      actorType: 'staff',
      action: 'tournament.team_added',
      resourceType: 'tournament_team',
      resourceId: row.id,
      metadata: { tournamentId, name: row.name },
    })
    return rowToTeam(row)
  } catch (err) {
    // uq_tournament_teams_name es case-insensitive: da un mensaje útil en vez
    // de un 23505 crudo.
    if (isUniqueViolation(err, 'uq_tournament_teams_name')) {
      throw new DuplicateTeamNameError(input.name.trim())
    }
    throw err
  }
}

export async function updateTeam(
  tenantId: string,
  staffUserId: string,
  input: UpdateTeamInput & { id: string },
  tx: DbTx,
): Promise<TournamentTeamRow> {
  await getTeam(tenantId, input.id, tx)

  const patch: Partial<typeof tournamentTeams.$inferInsert> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.contactPlayerId !== undefined) patch.contactPlayerId = input.contactPlayerId
  if (input.contactName !== undefined) patch.contactName = input.contactName
  if (input.contactPhone !== undefined) patch.contactPhone = input.contactPhone
  if (input.status !== undefined) patch.status = input.status
  if (input.groupLabel !== undefined) patch.groupLabel = input.groupLabel
  if (input.seed !== undefined) patch.seed = input.seed
  if (input.notes !== undefined) patch.notes = input.notes

  if (Object.keys(patch).length === 0) return getTeam(tenantId, input.id, tx)

  try {
    const updated = await tx
      .update(tournamentTeams)
      .set(patch)
      .where(
        and(eq(tournamentTeams.id, input.id), eq(tournamentTeams.tenantId, tenantId)),
      )
      .returning()

    const row = updated[0]
    if (!row) throw new TournamentTeamNotFoundError(input.id)

    await insertAuditLog(tx, {
      tenantId,
      actorId: staffUserId,
      actorType: 'staff',
      action: 'tournament.team_updated',
      resourceType: 'tournament_team',
      resourceId: row.id,
      metadata: { fields: Object.keys(patch) },
    })
    return rowToTeam(row)
  } catch (err) {
    if (isUniqueViolation(err, 'uq_tournament_teams_name')) {
      throw new DuplicateTeamNameError(patch.name ?? '')
    }
    throw err
  }
}

/** Borra el equipo y su plantel. Para "se bajó" usar status 'withdrawn'. */
export async function removeTeam(
  tenantId: string,
  staffUserId: string,
  teamId: string,
  tx: DbTx,
): Promise<void> {
  const team = await getTeam(tenantId, teamId, tx)

  // Hijos antes que el padre: no hay ON DELETE CASCADE (convención del repo).
  await tx
    .delete(tournamentTeamPlayers)
    .where(
      and(
        eq(tournamentTeamPlayers.teamId, teamId),
        eq(tournamentTeamPlayers.tenantId, tenantId),
      ),
    )
  await tx
    .delete(tournamentTeams)
    .where(and(eq(tournamentTeams.id, teamId), eq(tournamentTeams.tenantId, tenantId)))

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.team_removed',
    resourceType: 'tournament_team',
    resourceId: teamId,
    metadata: { tournamentId: team.tournamentId, name: team.name },
  })
}

// ─── Plantel ────────────────────────────────────────────────────────

export async function listTeamPlayers(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<TournamentTeamPlayerRow[]> {
  const rows = await tx
    .select()
    .from(tournamentTeamPlayers)
    .where(
      and(
        eq(tournamentTeamPlayers.tenantId, tenantId),
        eq(tournamentTeamPlayers.teamId, teamId),
      ),
    )
    .orderBy(asc(tournamentTeamPlayers.shirtNumber), asc(tournamentTeamPlayers.fullName))
  return rows.map(rowToTeamPlayer)
}

export async function addTeamPlayer(
  tenantId: string,
  staffUserId: string,
  teamId: string,
  input: CreateTeamPlayerInput,
  tx: DbTx,
): Promise<TournamentTeamPlayerRow> {
  await getTeam(tenantId, teamId, tx)

  try {
    const inserted = await tx
      .insert(tournamentTeamPlayers)
      .values({
        tenantId,
        teamId,
        fullName: input.fullName.trim(),
        playerId: input.playerId ?? null,
        dni: input.dni ?? null,
        shirtNumber: input.shirtNumber ?? null,
      })
      .returning()

    const row = inserted[0]!
    await insertAuditLog(tx, {
      tenantId,
      actorId: staffUserId,
      actorType: 'staff',
      action: 'tournament.team_player_added',
      resourceType: 'tournament_team',
      resourceId: teamId,
      metadata: { playerName: row.fullName, linked: row.playerId !== null },
    })
    return rowToTeamPlayer(row)
  } catch (err) {
    if (isUniqueViolation(err, 'uq_tournament_team_players_shirt')) {
      throw new DuplicateShirtNumberError(input.shirtNumber!)
    }
    throw err
  }
}

export async function removeTeamPlayer(
  tenantId: string,
  staffUserId: string,
  teamPlayerId: string,
  tx: DbTx,
): Promise<void> {
  const deleted = await tx
    .delete(tournamentTeamPlayers)
    .where(
      and(
        eq(tournamentTeamPlayers.id, teamPlayerId),
        eq(tournamentTeamPlayers.tenantId, tenantId),
      ),
    )
    .returning()

  const row = deleted[0]
  if (!row) throw new TournamentTeamNotFoundError(teamPlayerId)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.team_player_removed',
    resourceType: 'tournament_team',
    resourceId: row.teamId,
    metadata: { playerName: row.fullName },
  })
}
