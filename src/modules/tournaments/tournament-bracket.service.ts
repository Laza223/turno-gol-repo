/**
 * El cuadro: cargar un partido con el `kind` de su fase, y propagar el ganador
 * al partido siguiente.
 *
 * Vive aparte de `tournament-result.service` y de `tournament-standings.service`
 * porque los DOS lo necesitan — el de resultados para avanzar la llave al
 * cargar un marcador, el de posiciones para re-propagar al sembrar los
 * playoffs. Tenerlo en cualquiera de los dos crearía un import circular.
 */
import { sql } from 'drizzle-orm'
import type { tournamentMatches } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { matchOutcome } from './standings/bracket'
import type { StandingsMatch } from './standings/types'
import {
  DownstreamMatchAlreadyPlayedError,
  MatchNotFoundError,
} from './tournament.errors'
import type { TournamentMatchRow, TournamentStageKind } from './tournament.types'

/** El partido más el `kind` de su fase, que decide varias validaciones. */
export type MatchWithStage = typeof tournamentMatches.$inferSelect & {
  stageKind: TournamentStageKind
  stageOrderIndex: number
}

export async function loadMatch(
  tenantId: string,
  matchId: string,
  tx: DbTx,
): Promise<MatchWithStage> {
  const rows = (await tx.execute(sql`
    SELECT m.*, s.kind AS "stageKind", s.order_index AS "stageOrderIndex"
    FROM tournament_matches m
    JOIN tournament_stages s ON s.id = m.stage_id
    WHERE m.id = ${matchId} AND m.tenant_id = ${tenantId}
    LIMIT 1
  `)) as unknown as Array<Record<string, unknown>>
  const r = rows[0]
  if (!r) throw new MatchNotFoundError(matchId)

  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    tournamentId: r.tournament_id as string,
    stageId: r.stage_id as string,
    round: r.round as number,
    groupLabel: (r.group_label as string | null) ?? null,
    bracketSlot: (r.bracket_slot as number | null) ?? null,
    homeTeamId: (r.home_team_id as string | null) ?? null,
    awayTeamId: (r.away_team_id as string | null) ?? null,
    homeSourceMatchId: (r.home_source_match_id as string | null) ?? null,
    awaySourceMatchId: (r.away_source_match_id as string | null) ?? null,
    isThirdPlace: r.is_third_place as boolean,
    courtId: (r.court_id as string | null) ?? null,
    bookingId: (r.booking_id as string | null) ?? null,
    // tx.execute crudo devuelve las fechas como string.
    startsAt: r.starts_at ? new Date(r.starts_at as string) : null,
    endsAt: r.ends_at ? new Date(r.ends_at as string) : null,
    status: r.status as TournamentMatchRow['status'],
    homeScore: (r.home_score as number | null) ?? null,
    awayScore: (r.away_score as number | null) ?? null,
    homePenalties: (r.home_penalties as number | null) ?? null,
    awayPenalties: (r.away_penalties as number | null) ?? null,
    walkoverWinnerTeamId: (r.walkover_winner_team_id as string | null) ?? null,
    homeSourceSeed: (r.home_source_seed as number | null) ?? null,
    awaySourceSeed: (r.away_source_seed as number | null) ?? null,
    playedAt: r.played_at ? new Date(r.played_at as string) : null,
    notes: (r.notes as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
    stageKind: r.stageKind as TournamentStageKind,
    stageOrderIndex: r.stageOrderIndex as number,
  }
}

/** El partido tal como lo ve el motor puro. */
export function toStandingsMatch(m: MatchWithStage): StandingsMatch {
  return {
    id: m.id,
    stageId: m.stageId,
    stageOrderIndex: m.stageOrderIndex,
    stageKind: m.stageKind,
    groupLabel: m.groupLabel ?? null,
    round: m.round,
    bracketSlot: m.bracketSlot ?? null,
    startsAt: m.startsAt ?? null,
    status: m.status,
    homeTeamId: m.homeTeamId ?? null,
    awayTeamId: m.awayTeamId ?? null,
    homeScore: m.homeScore ?? null,
    awayScore: m.awayScore ?? null,
    homePenalties: m.homePenalties ?? null,
    awayPenalties: m.awayPenalties ?? null,
    walkoverWinnerTeamId: m.walkoverWinnerTeamId ?? null,
  }
}

/**
 * Propaga el resultado al cuadro, en cascada y por RE-DERIVACIÓN COMPLETA (no
 * por delta): cada dependiente recalcula quién le corresponde y se escribe solo
 * si cambió. Por eso corregir una semi des-propaga la final sola, y volver a
 * cargarla la vuelve a llenar — `clearMatchResult` no necesita lógica propia de
 * "des-avance".
 *
 * El puntero `*_source_match_id` NUNCA se toca: es el cableado del cuadro. Lo
 * que se escribe es `*_team_id`, la cache de "quién juega".
 */
export async function propagateResult(
  tenantId: string,
  matchId: string,
  tx: DbTx,
): Promise<{ updated: string[] }> {
  const updated: string[] = []
  const visited = new Set<string>()
  const queue: string[] = [matchId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const current = await loadMatch(tenantId, currentId, tx)
    const outcome = matchOutcome(toStandingsMatch(current))

    // El partido por el 3er puesto apunta a las DOS semis, así que el OR lo
    // cubre igual que a la final.
    const deps = (await tx.execute(sql`
      SELECT id, is_third_place AS "isThirdPlace",
             home_source_match_id AS "homeSource", away_source_match_id AS "awaySource",
             home_team_id AS "homeTeamId", away_team_id AS "awayTeamId",
             status
      FROM tournament_matches
      WHERE tenant_id = ${tenantId}
        AND (home_source_match_id = ${currentId} OR away_source_match_id = ${currentId})
    `)) as unknown as Array<{
      id: string
      isThirdPlace: boolean
      homeSource: string | null
      awaySource: string | null
      homeTeamId: string | null
      awayTeamId: string | null
      status: string
    }>

    for (const dep of deps) {
      // En el partido por el tercer puesto se leen los PERDEDORES.
      const expected = outcome
        ? dep.isThirdPlace
          ? outcome.loserTeamId
          : outcome.winnerTeamId
        : null

      const side = dep.homeSource === currentId ? 'home' : 'away'
      const stored = side === 'home' ? dep.homeTeamId : dep.awayTeamId
      if (stored === expected) continue

      // Cambiar el participante de un partido que ya se jugó reescribiría la
      // historia. Como todo corre en la misma tx y el try/catch vive fuera de
      // withTenantContext, el throw revierte también el marcador de arriba.
      if (dep.status === 'played' || dep.status === 'walkover') {
        throw new DownstreamMatchAlreadyPlayedError(dep.id)
      }

      await tx.execute(
        side === 'home'
          ? sql`UPDATE tournament_matches SET home_team_id = ${expected}
                WHERE id = ${dep.id} AND tenant_id = ${tenantId}`
          : sql`UPDATE tournament_matches SET away_team_id = ${expected}
                WHERE id = ${dep.id} AND tenant_id = ${tenantId}`,
      )
      updated.push(dep.id)
      queue.push(dep.id)
    }
  }

  return { updated }
}
