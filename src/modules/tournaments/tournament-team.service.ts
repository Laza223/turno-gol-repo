import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { tournamentTeamPlayers, tournamentTeams } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { getTournament } from './tournament.service'
import {
  DuplicateShirtNumberError,
  DuplicateTeamNameError,
  TeamHasEventsError,
  TeamHasFixtureError,
  TeamPlayerHasEventsError,
  TournamentFullError,
  TournamentTeamNotFoundError,
} from './tournament.errors'
import { countEventsForTeam, countEventsForTeamPlayer } from './tournament-result.service'
import { assertTeamHasNoPayments } from './tournament-payment.service'
import type {
  CreateTeamInput,
  CreateTeamPlayerInput,
  TournamentTeamPlayerRow,
  TournamentTeamRow,
  UpdateTeamInput,
} from './tournament.types'

// Los helpers viven en pg-errors.ts desde la fase 3 (los comparte el service de
// resultados). Se re-exporta para no romper el import del test unitario.
import { isUniqueViolation } from '@/shared/db/pg-errors'
export { isUniqueViolation }

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
    inscriptionFee: r.inscriptionFee,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function rowToTeamPlayer(r: typeof tournamentTeamPlayers.$inferSelect): TournamentTeamPlayerRow {
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
      and(eq(tournamentTeams.tenantId, tenantId), eq(tournamentTeams.tournamentId, tournamentId)),
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
        // Migr. 066: snapshot del arancel vigente al inscribirse. Un cambio
        // posterior en el torneo no mueve lo que este equipo debe.
        inscriptionFee: input.inscriptionFee ?? tournament.inscriptionFee,
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
  if (input.inscriptionFee !== undefined) patch.inscriptionFee = input.inscriptionFee
  if (input.notes !== undefined) patch.notes = input.notes

  if (Object.keys(patch).length === 0) return getTeam(tenantId, input.id, tx)

  try {
    const updated = await tx
      .update(tournamentTeams)
      .set(patch)
      .where(and(eq(tournamentTeams.id, input.id), eq(tournamentTeams.tenantId, tenantId)))
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

  // Un equipo que ya está en el fixture no se borra: la FK lo frenaría igual,
  // pero con un 23503 crudo y sin decir qué hacer.
  const inFixture = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM tournament_matches
    WHERE tenant_id = ${tenantId}
      AND (home_team_id = ${teamId} OR away_team_id = ${teamId}
           OR walkover_winner_team_id = ${teamId})
  `)) as unknown as Array<{ count: number }>
  const matchCount = inFixture[0]?.count ?? 0
  if (matchCount > 0) throw new TeamHasFixtureError(matchCount)

  const events = await countEventsForTeam(tenantId, teamId, tx)
  if (events > 0) throw new TeamHasEventsError(events)

  // Migr. 066: y tampoco si ya pagó. Borrarlo dejaría la caja de ese día
  // descuadrada contra un cierre ya firmado.
  await assertTeamHasNoPayments(tenantId, teamId, tx)

  // Hijos antes que el padre: no hay ON DELETE CASCADE (convención del repo).
  await tx
    .delete(tournamentTeamPlayers)
    .where(
      and(eq(tournamentTeamPlayers.teamId, teamId), eq(tournamentTeamPlayers.tenantId, tenantId)),
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
      and(eq(tournamentTeamPlayers.tenantId, tenantId), eq(tournamentTeamPlayers.teamId, teamId)),
    )
    .orderBy(asc(tournamentTeamPlayers.shirtNumber), asc(tournamentTeamPlayers.fullName))
  return rows.map(rowToTeamPlayer)
}

/**
 * Los planteles de varios equipos en UNA query, agrupados por equipo.
 *
 * La ficha del torneo (`app/(admin)/torneos/[id]/page.tsx`) necesita el plantel
 * de todos los equipos para la UI de altas y bajas. Antes lo resolvía con
 * `teams.map(t => listTeamPlayers(...))`: una consulta por equipo en cada carga
 * de la página. El `Promise.all` que las envolvía no ayudaba — corren sobre el
 * mismo `tx`, o sea la misma conexión, así que se serializan igual (es el mismo
 * motivo por el que `doctor.config.mjs:36-57` prohíbe "arreglar" estos loops con
 * `Promise.all`).
 *
 * Devuelve una entrada por cada id pedido, aunque el equipo no tenga jugadores,
 * para que el llamador no tenga que defenderse de un `undefined`.
 */
export async function listTeamPlayersByTeams(
  tenantId: string,
  teamIds: string[],
  tx: DbTx,
): Promise<Record<string, TournamentTeamPlayerRow[]>> {
  const byTeam: Record<string, TournamentTeamPlayerRow[]> = {}
  for (const id of teamIds) byTeam[id] = []
  if (teamIds.length === 0) return byTeam

  const rows = await tx
    .select()
    .from(tournamentTeamPlayers)
    .where(
      and(
        eq(tournamentTeamPlayers.tenantId, tenantId),
        inArray(tournamentTeamPlayers.teamId, teamIds),
      ),
    )
    .orderBy(asc(tournamentTeamPlayers.shirtNumber), asc(tournamentTeamPlayers.fullName))

  for (const row of rows) {
    const bucket = byTeam[row.teamId]
    if (bucket) bucket.push(rowToTeamPlayer(row))
  }
  return byTeam
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
  // Sus goles y tarjetas son historial del torneo: no se borra en silencio.
  const events = await countEventsForTeamPlayer(tenantId, teamPlayerId, tx)
  if (events > 0) throw new TeamPlayerHasEventsError(events)

  const deleted = await tx
    .delete(tournamentTeamPlayers)
    .where(
      and(eq(tournamentTeamPlayers.id, teamPlayerId), eq(tournamentTeamPlayers.tenantId, tenantId)),
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
