/**
 * Quién gana una llave y quién clasifica de una zona.
 *
 * Puro: lo consume `propagateResult` (avance del ganador al partido siguiente)
 * y `seedPlayoffs` (siembra del cuadro desde la tabla de las zonas).
 */
import { StandingsTieUnresolvedError } from '../tournament.errors'
import type { StandingsGroup, StandingsMatch } from './types'

/** Ganador/perdedor de un partido cerrado. null = todavía no está decidido. */
export function matchOutcome(
  m: StandingsMatch,
): { winnerTeamId: string; loserTeamId: string } | null {
  if (m.homeTeamId === null || m.awayTeamId === null) return null

  if (m.status === 'walkover') {
    // Doble ausencia: la llave no avanza. El service lo prohíbe en knockout.
    if (m.walkoverWinnerTeamId === null) return null
    const winnerTeamId = m.walkoverWinnerTeamId
    const loserTeamId = winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
    return { winnerTeamId, loserTeamId }
  }

  if (m.status !== 'played') return null
  if (m.homeScore === null || m.awayScore === null) return null

  if (m.homeScore > m.awayScore) {
    return { winnerTeamId: m.homeTeamId, loserTeamId: m.awayTeamId }
  }
  if (m.homeScore < m.awayScore) {
    return { winnerTeamId: m.awayTeamId, loserTeamId: m.homeTeamId }
  }

  // Empate: decide la tanda de penales, si se cargó.
  if (m.homePenalties === null || m.awayPenalties === null) return null
  if (m.homePenalties > m.awayPenalties) {
    return { winnerTeamId: m.homeTeamId, loserTeamId: m.awayTeamId }
  }
  if (m.homePenalties < m.awayPenalties) {
    return { winnerTeamId: m.awayTeamId, loserTeamId: m.homeTeamId }
  }
  return null
}

export type QualifiedSeed = {
  /** 1-based; es lo que va a home_source_seed / away_source_seed. */
  seed: number
  teamId: string
  groupLabel: string
  /** 1 = campeón de su zona. */
  rank: number
}

/**
 * Clasificados de las zonas, en orden rank-major: 1ºA, 1ºB, …, 2ºA, 2ºB, …
 *
 * Con el `seedOrder` del generador de llaves ([1,4,2,3] para 4), ese orden
 * produce el cruce clásico 1ºA-2ºB / 1ºB-2ºA sin tocar el motor de la fase 2.
 *
 * Los equipos que se bajaron o quedaron descalificados se saltean y sube el
 * siguiente de la zona.
 */
export function qualifiedSeeds(
  groups: readonly StandingsGroup[],
  advancePerGroup: number,
): QualifiedSeed[] {
  const ordered = [...groups].sort((a, b) => (a.groupLabel ?? '').localeCompare(b.groupLabel ?? ''))

  /** Por zona, los equipos elegibles ya ordenados por la tabla. */
  const eligibleByGroup = ordered.map((g) => {
    const rows = g.rows.filter(
      (r) => r.teamStatus !== 'withdrawn' && r.teamStatus !== 'disqualified',
    )
    const cut = rows.slice(0, advancePerGroup)
    // Un empate irresoluble JUSTO en el puesto de corte decide quién pasa: no
    // se puede sembrar el cuadro a ciegas. Uno que no cruza la línea no molesta.
    const borderline = cut[cut.length - 1]
    if (borderline?.unresolvedTie) {
      const tied = rows
        .filter((r) => r.points === borderline.points && r.unresolvedTie)
        .map((r) => r.teamName)
      throw new StandingsTieUnresolvedError(g.groupLabel ?? '', tied)
    }
    return { groupLabel: g.groupLabel ?? '', rows: cut }
  })

  const out: QualifiedSeed[] = []
  let seed = 1
  for (let rank = 1; rank <= advancePerGroup; rank++) {
    for (const group of eligibleByGroup) {
      const row = group.rows[rank - 1]
      if (!row) continue
      out.push({ seed: seed++, teamId: row.teamId, groupLabel: group.groupLabel, rank })
    }
  }
  return out
}

/**
 * '1º Zona A' — inversa exacta de `qualifiedSeeds`, para dibujar el cuadro
 * antes de que las zonas estén cerradas.
 */
export function qualifierLabel(seed: number, groupsCount: number): string {
  if (groupsCount <= 0) return `Clasificado ${seed}`
  const zeroBased = seed - 1
  const rank = Math.floor(zeroBased / groupsCount) + 1
  const groupIndex = zeroBased % groupsCount
  const label = String.fromCharCode(65 + groupIndex)
  return `${rank}º Zona ${label}`
}
