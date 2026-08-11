/**
 * Lectura de la tabla de posiciones, goleadores y disciplina, y siembra de los
 * playoffs desde la tabla de las zonas.
 *
 * Todo se DERIVA al leer: tres SELECT acotados y después el motor puro. No hay
 * contadores materializados que se puedan desincronizar cuando se borra un gol
 * cargado por error.
 */
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { getTournament } from './tournament.service'
import { computeStandings } from './standings/standings'
import { computeSuspensions, type SuspensionRow } from './standings/suspensions'
import { qualifiedSeeds, type QualifiedSeed } from './standings/bracket'
import { propagateResult } from './tournament-bracket.service'
import type { StandingsGroup, StandingsInput, StandingsMatch } from './standings/types'
import {
  GroupStageNotFinishedError,
  NotAGroupsTournamentError,
  PlayoffBracketNotSeedableError,
  PlayoffSeedMismatchError,
  PlayoffStageNotFoundError,
  PlayoffsAlreadyStartedError,
} from './tournament.errors'
import type { ScorerRow, TopScorersResult, Tiebreaker } from './tournament.types'

/** Los tres SELECT que alimentan el motor. */
export async function loadStandingsInput(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<StandingsInput> {
  const tournament = await getTournament(tenantId, tournamentId, tx)

  const teamRows = (await tx.execute(sql`
    SELECT id, name, name_normalized AS "nameNormalized", seed, status
    FROM tournament_teams
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
  `)) as unknown as Array<{
    id: string
    name: string
    nameNormalized: string
    seed: number | null
    status: string
  }>

  const matchRows = (await tx.execute(sql`
    SELECT m.id, m.stage_id AS "stageId", s.order_index AS "stageOrderIndex",
           s.kind AS "stageKind", m.group_label AS "groupLabel", m.round,
           m.bracket_slot AS "bracketSlot", m.starts_at AS "startsAt", m.status,
           m.home_team_id AS "homeTeamId", m.away_team_id AS "awayTeamId",
           m.home_score AS "homeScore", m.away_score AS "awayScore",
           m.home_penalties AS "homePenalties", m.away_penalties AS "awayPenalties",
           m.walkover_winner_team_id AS "walkoverWinnerTeamId"
    FROM tournament_matches m
    JOIN tournament_stages s ON s.id = m.stage_id
    WHERE m.tenant_id = ${tenantId} AND m.tournament_id = ${tournamentId}
  `)) as unknown as Array<Record<string, unknown>>

  const eventRows = (await tx.execute(sql`
    SELECT id, match_id AS "matchId", team_id AS "teamId",
           team_player_id AS "teamPlayerId", type,
           suspension_matches AS "suspensionMatches"
    FROM tournament_match_events
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
  `)) as unknown as Array<{
    id: string
    matchId: string
    teamId: string
    teamPlayerId: string | null
    type: string
    suspensionMatches: number | null
  }>

  return {
    teams: teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      nameNormalized: t.nameNormalized,
      seed: t.seed ?? null,
      status: t.status as StandingsInput['teams'][number]['status'],
    })),
    matches: matchRows.map((r) => ({
      id: r.id as string,
      stageId: r.stageId as string,
      stageOrderIndex: r.stageOrderIndex as number,
      stageKind: r.stageKind as StandingsMatch['stageKind'],
      groupLabel: (r.groupLabel as string | null) ?? null,
      round: r.round as number,
      bracketSlot: (r.bracketSlot as number | null) ?? null,
      // tx.execute crudo devuelve las fechas como string.
      startsAt: r.startsAt ? new Date(r.startsAt as string) : null,
      status: r.status as StandingsMatch['status'],
      homeTeamId: (r.homeTeamId as string | null) ?? null,
      awayTeamId: (r.awayTeamId as string | null) ?? null,
      homeScore: (r.homeScore as number | null) ?? null,
      awayScore: (r.awayScore as number | null) ?? null,
      homePenalties: (r.homePenalties as number | null) ?? null,
      awayPenalties: (r.awayPenalties as number | null) ?? null,
      walkoverWinnerTeamId: (r.walkoverWinnerTeamId as string | null) ?? null,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      matchId: e.matchId,
      teamId: e.teamId,
      teamPlayerId: e.teamPlayerId ?? null,
      type: e.type as StandingsInput['events'][number]['type'],
      suspensionMatches: e.suspensionMatches ?? null,
    })),
    config: {
      pointsWin: tournament.pointsWin,
      pointsDraw: tournament.pointsDraw,
      pointsLoss: tournament.pointsLoss,
      tiebreakers: tournament.tiebreakers as Tiebreaker[],
    },
  }
}

export async function getStandings(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<StandingsGroup[]> {
  return computeStandings(await loadStandingsInput(tenantId, tournamentId, tx))
}

export async function getDisciplineBoard(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<SuspensionRow[]> {
  const tournament = await getTournament(tenantId, tournamentId, tx)
  const input = await loadStandingsInput(tenantId, tournamentId, tx)
  return computeSuspensions({
    matches: input.matches,
    events: input.events,
    config: {
      yellowCardsForSuspension: tournament.yellowCardsForSuspension,
      redCardSuspensionMatches: tournament.redCardSuspensionMatches,
    },
  })
}

/**
 * Goleadores. Agregado en SQL porque es un ranking simple y no necesita el
 * motor; el filtro por estado del partido es lo que hace que borrar un
 * resultado saque los goles del ranking sin tocar el acta.
 */
export async function getTopScorers(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
  limit = 50,
): Promise<TopScorersResult> {
  const rows = (await tx.execute(sql`
    SELECT e.team_player_id           AS "teamPlayerId",
           p.full_name                AS "playerName",
           p.shirt_number             AS "shirtNumber",
           t.id                       AS "teamId",
           t.name                     AS "teamName",
           count(*)::int              AS goals
    FROM tournament_match_events e
    JOIN tournament_matches m       ON m.id = e.match_id
    JOIN tournament_team_players p  ON p.id = e.team_player_id
    JOIN tournament_teams t         ON t.id = e.team_id
    WHERE e.tenant_id = ${tenantId}
      AND e.tournament_id = ${tournamentId}
      AND e.type = 'goal'
      AND e.team_player_id IS NOT NULL
      AND m.status IN ('played', 'walkover')
    GROUP BY e.team_player_id, p.full_name, p.shirt_number, t.id, t.name
    ORDER BY goals DESC, lower(p.full_name)
    LIMIT ${limit}
  `)) as unknown as Array<Record<string, unknown>>

  const scorers: ScorerRow[] = rows.map((r) => ({
    teamPlayerId: r.teamPlayerId as string,
    playerName: r.playerName as string,
    shirtNumber: (r.shirtNumber as number | null) ?? null,
    teamId: r.teamId as string,
    teamName: r.teamName as string,
    goals: r.goals as number,
  }))

  // Goles de los marcadores que todavía no tienen autor. Se calcula acá para
  // que la UI lo muestre sin re-derivarlo a mano.
  const totals = (await tx.execute(sql`
    SELECT
      COALESCE(SUM(m.home_score + m.away_score), 0)::int AS "scoreboardGoals",
      (SELECT count(*)::int FROM tournament_match_events e2
        JOIN tournament_matches m2 ON m2.id = e2.match_id
        WHERE e2.tenant_id = ${tenantId} AND e2.tournament_id = ${tournamentId}
          AND e2.type IN ('goal', 'own_goal')
          AND m2.status IN ('played', 'walkover')) AS "attributed"
    FROM tournament_matches m
    WHERE m.tenant_id = ${tenantId} AND m.tournament_id = ${tournamentId}
      AND m.status IN ('played', 'walkover')
  `)) as unknown as Array<{ scoreboardGoals: number; attributed: number }>

  const t = totals[0]
  const unattributed = t ? Math.max(0, t.scoreboardGoals - t.attributed) : 0

  return { rows: scorers, unattributedGoals: unattributed }
}

// ─── Siembra de playoffs ────────────────────────────────────────────

type SeedContext = {
  groupStageId: string
  advancePerGroup: number
  playoffMatches: Array<{
    id: string
    homeSourceSeed: number | null
    awaySourceSeed: number | null
    homeTeamId: string | null
    awayTeamId: string | null
    status: string
  }>
}

async function loadSeedContext(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<SeedContext> {
  const stages = (await tx.execute(sql`
    SELECT id, kind, order_index AS "orderIndex",
           teams_advance_per_group AS "advance"
    FROM tournament_stages
    WHERE tenant_id = ${tenantId} AND tournament_id = ${tournamentId}
    ORDER BY order_index
  `)) as unknown as Array<{
    id: string
    kind: string
    orderIndex: number
    advance: number | null
  }>

  const groupStage = stages.find((s) => s.kind === 'group_stage')
  const playoffStage = stages.find((s) => s.kind === 'knockout')
  if (!groupStage || !playoffStage) throw new PlayoffStageNotFoundError()

  const playoffMatches = (await tx.execute(sql`
    SELECT id, home_source_seed AS "homeSourceSeed",
           away_source_seed AS "awaySourceSeed",
           home_team_id AS "homeTeamId", away_team_id AS "awayTeamId", status
    FROM tournament_matches
    WHERE tenant_id = ${tenantId} AND stage_id = ${playoffStage.id}
  `)) as unknown as SeedContext['playoffMatches']

  return {
    groupStageId: groupStage.id,
    // teams_advance_per_group vive en la fila de la fase de GRUPOS: en la de
    // playoffs es NULL por chk_stage_groups_kind.
    advancePerGroup: groupStage.advance ?? 2,
    playoffMatches,
  }
}

/** Núcleo compartido por seedPlayoffs y resyncPlayoffSeeds. */
async function applySeeding(
  tenantId: string,
  tournamentId: string,
  ctx: SeedContext,
  tx: DbTx,
): Promise<{ seeded: number; qualified: QualifiedSeed[] }> {
  const groups = (await getStandings(tenantId, tournamentId, tx)).filter(
    (g) => g.stageId === ctx.groupStageId,
  )
  const qualified = qualifiedSeeds(groups, ctx.advancePerGroup)
  const teamBySeed = new Map(qualified.map((q) => [q.seed, q.teamId]))

  let seeded = 0
  let expected = 0
  for (const pm of ctx.playoffMatches) {
    for (const side of ['home', 'away'] as const) {
      const seed = side === 'home' ? pm.homeSourceSeed : pm.awaySourceSeed
      if (seed === null) continue
      expected++
      const teamId = teamBySeed.get(seed) ?? null
      const stored = side === 'home' ? pm.homeTeamId : pm.awayTeamId
      if (stored === teamId) {
        seeded++
        continue
      }
      if (pm.status === 'played' || pm.status === 'walkover') {
        throw new PlayoffsAlreadyStartedError()
      }
      await tx.execute(
        side === 'home'
          ? sql`UPDATE tournament_matches SET home_team_id = ${teamId}
                WHERE id = ${pm.id} AND tenant_id = ${tenantId}`
          : sql`UPDATE tournament_matches SET away_team_id = ${teamId}
                WHERE id = ${pm.id} AND tenant_id = ${tenantId}`,
      )
      seeded++
    }
  }

  // Evita la siembra parcial silenciosa si teams_advance_per_group cambió
  // después de generar el cuadro.
  if (seeded !== expected) throw new PlayoffSeedMismatchError(expected, seeded)

  // Idempotente: si algún cruce de la primera ronda ya está decidido, propaga.
  for (const pm of ctx.playoffMatches) {
    if (pm.status === 'played' || pm.status === 'walkover') {
      await propagateResult(tenantId, pm.id, tx)
    }
  }

  return { seeded, qualified }
}

/** Botón "Cerrar zonas y sortear cruces". */
export async function seedPlayoffs(
  tenantId: string,
  staffUserId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<{ seeded: number; qualified: QualifiedSeed[] }> {
  const tournament = await getTournament(tenantId, tournamentId, tx)
  if (tournament.format !== 'groups_playoff') throw new NotAGroupsTournamentError()

  const ctx = await loadSeedContext(tenantId, tournamentId, tx)

  const pending = (await tx.execute(sql`
    SELECT count(*)::int AS "count" FROM tournament_matches
    WHERE tenant_id = ${tenantId} AND stage_id = ${ctx.groupStageId}
      AND status NOT IN ('played', 'walkover', 'canceled')
  `)) as unknown as Array<{ count: number }>
  const pendingCount = pending[0]?.count ?? 0
  if (pendingCount > 0) throw new GroupStageNotFinishedError(pendingCount)

  const seedable = ctx.playoffMatches.some(
    (m) => m.homeSourceSeed !== null || m.awaySourceSeed !== null,
  )
  if (!seedable) throw new PlayoffBracketNotSeedableError()

  const result = await applySeeding(tenantId, tournamentId, ctx, tx)

  await insertAuditLog(tx, {
    tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'tournament.playoffs_seeded',
    resourceType: 'tournament',
    resourceId: tournamentId,
    metadata: { seeded: result.seeded, qualified: result.qualified },
  })

  return result
}

/**
 * Re-siembra cuando ya se había sembrado. NO-OP si el torneo no es de zonas o
 * si el cuadro todavía está vacío: corregir un resultado de zona después de
 * sembrar tiene que re-derivar los cruces en la misma tx, en vez de dejar un
 * cuadro que la tabla ya no respalda.
 */
export async function resyncPlayoffSeeds(
  tenantId: string,
  tournamentId: string,
  tx: DbTx,
): Promise<{ seeded: number }> {
  const tournament = await getTournament(tenantId, tournamentId, tx)
  if (tournament.format !== 'groups_playoff') return { seeded: 0 }

  let ctx: SeedContext
  try {
    ctx = await loadSeedContext(tenantId, tournamentId, tx)
  } catch (err) {
    if (err instanceof PlayoffStageNotFoundError) return { seeded: 0 }
    throw err
  }

  // Todavía no se sembró nada: no hay nada que re-derivar.
  const alreadySeeded = ctx.playoffMatches.some(
    (m) => m.homeTeamId !== null || m.awayTeamId !== null,
  )
  if (!alreadySeeded) return { seeded: 0 }

  const { seeded } = await applySeeding(tenantId, tournamentId, ctx, tx)
  return { seeded }
}
