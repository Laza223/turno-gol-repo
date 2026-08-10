/**
 * Cargar resultados, el acta del partido y el avance de las llaves.
 *
 * Todas las funciones reciben la `tx` de afuera (nunca abren
 * `withTenantContext`) y filtran por `tenant_id` explícito además de RLS.
 *
 * El acta es append-only: se inserta o se borra, nunca se actualiza. Borrar un
 * resultado NO borra los eventos — quedan congelados (un evento cuenta si y
 * solo si su partido está en estado final) y se reactivan idénticos al volver a
 * cargar el marcador.
 */
import { and, eq, sql } from 'drizzle-orm'
import { tournamentMatchEvents, tournamentMatches } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { getTournament } from './tournament.service'
import { isForeignKeyViolation, isUniqueViolation } from './pg-errors'
import { scoringTeamId } from './standings/standings'
import {
  loadMatch,
  propagateResult,
  type MatchWithStage,
} from './tournament-bracket.service'
import { resyncPlayoffSeeds } from './tournament-standings.service'
import {
  DuplicateCardError,
  EventPlayerNotInTeamError,
  EventTeamNotInMatchError,
  GoalsExceedScoreError,
  KnockoutTieUnresolvedError,
  MatchEventNotFoundError,
  MatchNotFoundError,
  MatchNotPlayableError,
  MatchTeamsUndefinedError,
  PenaltiesNotAllowedError,
  WalkoverNeedsWinnerError,
  WalkoverWinnerNotInMatchError,
  WalkoverWithEventsError,
} from './tournament.errors'
import type {
  AddMatchEventInput,
  MarkWalkoverInput,
  SaveMatchResultInput,
  TournamentMatchEventRow,
  TournamentMatchEventView,
  TournamentMatchRow,
} from './tournament.types'

function rowToEvent(
  r: typeof tournamentMatchEvents.$inferSelect,
): TournamentMatchEventRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tournamentId: r.tournamentId,
    matchId: r.matchId,
    teamId: r.teamId,
    teamPlayerId: r.teamPlayerId ?? null,
    type: r.type,
    minute: r.minute ?? null,
    suspensionMatches: r.suspensionMatches ?? null,
    notes: r.notes ?? null,
    createdByStaff: r.createdByStaff ?? null,
    createdAt: r.createdAt,
  }
}

/** Se puede cargar resultado: existe, no está cancelado y tiene los dos equipos. */
function assertPlayable(m: MatchWithStage): void {
  if (m.status === 'canceled') throw new MatchNotPlayableError(m.status)
  if (m.homeTeamId === null || m.awayTeamId === null) {
    throw new MatchTeamsUndefinedError(m.id)
  }
}

/**
 * Nadie puede cargar más goles en el acta que los del marcador.
 *
 * Cuenta por equipo ANOTADOR, así que un gol en contra pesa del lado del rival.
 * El defecto (marcador 3, un solo goleador) es legal y se muestra como "faltan
 * N goles sin autor": obligar a cerrar el acta trabaría al encargado.
 */
async function assertGoalsFitScore(
  tenantId: string,
  m: MatchWithStage,
  homeScore: number,
  awayScore: number,
  tx: DbTx,
  extra?: { teamId: string; type: string },
): Promise<void> {
  const rows = (await tx.execute(sql`
    SELECT team_id AS "teamId", type
    FROM tournament_match_events
    WHERE tenant_id = ${tenantId} AND match_id = ${m.id}
      AND type IN ('goal', 'own_goal')
  `)) as unknown as Array<{ teamId: string; type: string }>

  const all = extra ? [...rows, extra] : rows
  const counts = new Map<string, number>()
  for (const ev of all) {
    const scorer = scoringTeamId(
      { teamId: ev.teamId, type: ev.type as 'goal' | 'own_goal' },
      { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId },
    )
    if (scorer === null) continue
    counts.set(scorer, (counts.get(scorer) ?? 0) + 1)
  }

  const sides: Array<[string | null, number]> = [
    [m.homeTeamId, homeScore],
    [m.awayTeamId, awayScore],
  ]
  for (const [teamId, score] of sides) {
    if (teamId === null) continue
    const loaded = counts.get(teamId) ?? 0
    if (loaded > score) {
      const name = await teamName(tenantId, teamId, tx)
      throw new GoalsExceedScoreError(name, score)
    }
  }
}

async function teamName(tenantId: string, teamId: string, tx: DbTx): Promise<string> {
  const rows = (await tx.execute(sql`
    SELECT name FROM tournament_teams
    WHERE id = ${teamId} AND tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<{ name: string }>
  return rows[0]?.name ?? 'el equipo'
}

async function countEvents(tenantId: string, matchId: string, tx: DbTx): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM tournament_match_events
    WHERE tenant_id = ${tenantId} AND match_id = ${matchId}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

// ─── Resultado ──────────────────────────────────────────────────────

export async function saveMatchResult(
  tenantId: string,
  staffUserId: string,
  input: SaveMatchResultInput,
  tx: DbTx,
): Promise<TournamentMatchRow> {
  const m = await loadMatch(tenantId, input.matchId, tx)
  assertPlayable(m)

  const homePen = input.homePenalties ?? null
  const awayPen = input.awayPenalties ?? null
  const isDraw = input.homeScore === input.awayScore

  if (homePen !== null && !isDraw) throw new PenaltiesNotAllowedError()
  // Una llave no puede quedar empatada: nadie pasaría de ronda.
  if (m.stageKind === 'knockout' && isDraw && homePen === null) {
    throw new KnockoutTieUnresolvedError()
  }

  await assertGoalsFitScore(tenantId, m, input.homeScore, input.awayScore, tx)

  // Las 6 columnas SIEMPRE, aunque vengan en null: corregir un 2-2 con penales
  // a un 3-2 sin limpiar los penales viola chk_match_penalties_on_draw.
  const updated = await tx
    .update(tournamentMatches)
    .set({
      status: 'played',
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      homePenalties: homePen,
      awayPenalties: awayPen,
      walkoverWinnerTeamId: null,
      playedAt: new Date(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(and(eq(tournamentMatches.id, m.id), eq(tournamentMatches.tenantId, tenantId)))
    .returning()

  const row = updated[0]
  if (!row) throw new MatchNotFoundError(m.id)

  const { updated: advanced } = await propagateResult(tenantId, m.id, tx)
  // Corregir un resultado de zona DESPUÉS de sembrar tiene que re-derivar los
  // cruces en la misma tx, o el cuadro deja de estar respaldado por la tabla.
  if (m.stageKind === 'group_stage') {
    await resyncPlayoffSeeds(tenantId, m.tournamentId, tx)
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.match_result_saved',
    resourceType: 'tournament_match',
    resourceId: m.id,
    metadata: {
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      homePenalties: homePen,
      awayPenalties: awayPen,
      advanced,
    },
  })

  return toRow(row)
}

export async function markWalkover(
  tenantId: string,
  staffUserId: string,
  input: MarkWalkoverInput,
  tx: DbTx,
): Promise<TournamentMatchRow> {
  const m = await loadMatch(tenantId, input.matchId, tx)
  assertPlayable(m)

  const winner = input.winnerTeamId
  if (winner !== null && winner !== m.homeTeamId && winner !== m.awayTeamId) {
    throw new WalkoverWinnerNotInMatchError(winner)
  }
  // En una llave alguien tiene que pasar de ronda.
  if (m.stageKind === 'knockout' && winner === null) throw new WalkoverNeedsWinnerError()

  // El acta y un walkover no conviven: si no se jugó, no hay goles ni tarjetas.
  const events = await countEvents(tenantId, m.id, tx)
  if (events > 0) throw new WalkoverWithEventsError(events)

  const tournament = await getTournament(tenantId, m.tournamentId, tx)
  const goals = tournament.walkoverGoalsFor
  const homeScore = winner === null ? 0 : winner === m.homeTeamId ? goals : 0
  const awayScore = winner === null ? 0 : winner === m.awayTeamId ? goals : 0

  const updated = await tx
    .update(tournamentMatches)
    .set({
      status: 'walkover',
      homeScore,
      awayScore,
      homePenalties: null,
      awayPenalties: null,
      walkoverWinnerTeamId: winner,
      playedAt: new Date(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(and(eq(tournamentMatches.id, m.id), eq(tournamentMatches.tenantId, tenantId)))
    .returning()

  const row = updated[0]
  if (!row) throw new MatchNotFoundError(m.id)

  const { updated: advanced } = await propagateResult(tenantId, m.id, tx)
  if (m.stageKind === 'group_stage') {
    await resyncPlayoffSeeds(tenantId, m.tournamentId, tx)
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.match_walkover',
    resourceType: 'tournament_match',
    resourceId: m.id,
    metadata: { winnerTeamId: winner, homeScore, awayScore, advanced },
  })

  return toRow(row)
}

/**
 * Vuelve el partido a 'scheduled'. Los eventos NO se borran: son el acta y
 * quedan congelados hasta que se vuelva a cargar el resultado.
 */
export async function clearMatchResult(
  tenantId: string,
  staffUserId: string,
  matchId: string,
  tx: DbTx,
): Promise<TournamentMatchRow> {
  const m = await loadMatch(tenantId, matchId, tx)

  const updated = await tx
    .update(tournamentMatches)
    .set({
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      walkoverWinnerTeamId: null,
      playedAt: null,
    })
    .where(and(eq(tournamentMatches.id, m.id), eq(tournamentMatches.tenantId, tenantId)))
    .returning()

  const row = updated[0]
  if (!row) throw new MatchNotFoundError(matchId)

  // Des-propaga: deja en NULL los equipos aguas abajo que salían de este.
  const { updated: advanced } = await propagateResult(tenantId, m.id, tx)
  if (m.stageKind === 'group_stage') {
    await resyncPlayoffSeeds(tenantId, m.tournamentId, tx)
  }

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.match_result_cleared',
    resourceType: 'tournament_match',
    resourceId: m.id,
    metadata: { advanced },
  })

  return toRow(row)
}

function toRow(r: typeof tournamentMatches.$inferSelect): TournamentMatchRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tournamentId: r.tournamentId,
    stageId: r.stageId,
    round: r.round,
    groupLabel: r.groupLabel ?? null,
    bracketSlot: r.bracketSlot ?? null,
    homeTeamId: r.homeTeamId ?? null,
    awayTeamId: r.awayTeamId ?? null,
    homeSourceMatchId: r.homeSourceMatchId ?? null,
    awaySourceMatchId: r.awaySourceMatchId ?? null,
    isThirdPlace: r.isThirdPlace,
    courtId: r.courtId ?? null,
    bookingId: r.bookingId ?? null,
    startsAt: r.startsAt ?? null,
    endsAt: r.endsAt ?? null,
    status: r.status,
    homeScore: r.homeScore ?? null,
    awayScore: r.awayScore ?? null,
    homePenalties: r.homePenalties ?? null,
    awayPenalties: r.awayPenalties ?? null,
    walkoverWinnerTeamId: r.walkoverWinnerTeamId ?? null,
    homeSourceSeed: r.homeSourceSeed ?? null,
    awaySourceSeed: r.awaySourceSeed ?? null,
    playedAt: r.playedAt ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// ─── Acta ───────────────────────────────────────────────────────────

export async function addMatchEvent(
  tenantId: string,
  staffUserId: string,
  input: AddMatchEventInput,
  tx: DbTx,
): Promise<TournamentMatchEventRow> {
  const m = await loadMatch(tenantId, input.matchId, tx)
  if (m.status === 'canceled') throw new MatchNotPlayableError(m.status)
  if (input.teamId !== m.homeTeamId && input.teamId !== m.awayTeamId) {
    throw new EventTeamNotInMatchError(input.teamId)
  }

  // No se exige que el partido esté cerrado: el encargado anota durante el
  // partido y carga el marcador al final. Si ya hay marcador, se respeta.
  if (
    (input.type === 'goal' || input.type === 'own_goal') &&
    m.homeScore !== null &&
    m.awayScore !== null
  ) {
    await assertGoalsFitScore(tenantId, m, m.homeScore, m.awayScore, tx, {
      teamId: input.teamId,
      type: input.type,
    })
  }

  let inserted: (typeof tournamentMatchEvents.$inferSelect) | undefined
  try {
    const rows = await tx
      .insert(tournamentMatchEvents)
      .values({
        tenantId,
        tournamentId: m.tournamentId,
        matchId: m.id,
        teamId: input.teamId,
        teamPlayerId: input.teamPlayerId ?? null,
        type: input.type,
        minute: input.minute ?? null,
        suspensionMatches: input.suspensionMatches ?? null,
        notes: input.notes ?? null,
        createdByStaff: staffUserId,
      })
      .returning()
    inserted = rows[0]
  } catch (err) {
    if (isUniqueViolation(err, 'uq_tournament_match_events_one_yellow')) {
      throw new DuplicateCardError('yellow_card')
    }
    if (isUniqueViolation(err, 'uq_tournament_match_events_one_red')) {
      throw new DuplicateCardError('red_card')
    }
    // La FK compuesta (team_player_id, team_id) es la que garantiza que el
    // goleador pertenece al equipo al que se le carga el gol.
    if (isForeignKeyViolation(err, 'fk_event_player')) {
      throw new EventPlayerNotInTeamError(input.teamPlayerId ?? '')
    }
    throw err
  }

  if (!inserted) throw new MatchNotFoundError(m.id)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.match_event_added',
    resourceType: 'tournament_match_event',
    resourceId: inserted.id,
    metadata: {
      matchId: m.id,
      teamId: input.teamId,
      teamPlayerId: input.teamPlayerId ?? null,
      type: input.type,
      minute: input.minute ?? null,
    },
  })

  return rowToEvent(inserted)
}

/**
 * Borra un evento del acta. El payload completo va a `audit_logs`: es lo único
 * que queda del evento, porque la fila desaparece.
 */
export async function deleteMatchEvent(
  tenantId: string,
  staffUserId: string,
  eventId: string,
  tx: DbTx,
): Promise<{ matchId: string; tournamentId: string }> {
  const found = await tx
    .select()
    .from(tournamentMatchEvents)
    .where(
      and(
        eq(tournamentMatchEvents.id, eventId),
        eq(tournamentMatchEvents.tenantId, tenantId),
      ),
    )
    .limit(1)
  const ev = found[0]
  if (!ev) throw new MatchEventNotFoundError(eventId)

  await tx
    .delete(tournamentMatchEvents)
    .where(
      and(
        eq(tournamentMatchEvents.id, eventId),
        eq(tournamentMatchEvents.tenantId, tenantId),
      ),
    )

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.match_event_deleted',
    resourceType: 'tournament_match_event',
    resourceId: eventId,
    metadata: {
      matchId: ev.matchId,
      tournamentId: ev.tournamentId,
      teamId: ev.teamId,
      teamPlayerId: ev.teamPlayerId ?? null,
      type: ev.type,
      minute: ev.minute ?? null,
      suspensionMatches: ev.suspensionMatches ?? null,
      createdByStaff: ev.createdByStaff ?? null,
    },
  })

  return { matchId: ev.matchId, tournamentId: ev.tournamentId }
}

export async function listMatchEvents(
  tenantId: string,
  matchId: string,
  tx: DbTx,
): Promise<TournamentMatchEventView[]> {
  const rows = (await tx.execute(sql`
    SELECT e.*,
           t.name         AS "teamName",
           p.full_name    AS "playerName",
           p.shirt_number AS "shirtNumber"
    FROM tournament_match_events e
    JOIN tournament_teams t            ON t.id = e.team_id
    LEFT JOIN tournament_team_players p ON p.id = e.team_player_id
    WHERE e.tenant_id = ${tenantId} AND e.match_id = ${matchId}
    ORDER BY e.minute NULLS LAST, e.created_at
  `)) as unknown as Array<Record<string, unknown>>

  return rows.map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    tournamentId: r.tournament_id as string,
    matchId: r.match_id as string,
    teamId: r.team_id as string,
    teamPlayerId: (r.team_player_id as string | null) ?? null,
    type: r.type as TournamentMatchEventRow['type'],
    minute: (r.minute as number | null) ?? null,
    suspensionMatches: (r.suspension_matches as number | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdByStaff: (r.created_by_staff as string | null) ?? null,
    // tx.execute crudo devuelve las fechas como string.
    createdAt: new Date(r.created_at as string),
    teamName: (r.teamName as string | null) ?? null,
    playerName: (r.playerName as string | null) ?? null,
    shirtNumber: (r.shirtNumber as number | null) ?? null,
  }))
}

// B5 (2026-08-09): acá vivía `deleteEventsForMatch`, con un comentario que
// decía "lo usan los services de fase 1 y 2" — y no lo usaba nadie. El borrado
// en cascada real (la FK (match_id, tournament_id) es NO ACTION, así que hay
// que vaciar los eventos ANTES de borrar los partidos) lo hace `clearFixture`
// con su propio DELETE inline, en tournament-fixture.service.ts.

export async function countEventsForTeam(
  tenantId: string,
  teamId: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM tournament_match_events
    WHERE tenant_id = ${tenantId} AND team_id = ${teamId}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

export async function countEventsForTeamPlayer(
  tenantId: string,
  teamPlayerId: string,
  tx: DbTx,
): Promise<number> {
  const rows = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM tournament_match_events
    WHERE tenant_id = ${tenantId} AND team_player_id = ${teamPlayerId}
  `)) as unknown as Array<{ count: number }>
  return rows[0]?.count ?? 0
}
