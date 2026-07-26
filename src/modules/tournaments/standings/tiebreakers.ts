/**
 * Desempate de la tabla de posiciones.
 *
 * Los criterios se aplican EN ORDEN (los configura el torneo en un `text[]`).
 * Variante FIFA/UEFA: cuando un criterio parte un grupo de empatados, cada
 * subgrupo REINICIA la lista desde el principio. Eso es lo que hace que el
 * head-to-head se recalcule sobre los que siguen empatados y no sobre el grupo
 * original.
 *
 * Terminación (por qué no hay loop infinito): cada llamada recursiva o bien
 * deja el bucket igual y aumenta estrictamente el índice de criterio, o bien
 * achica estrictamente el bucket y reinicia el índice. Las dos medidas están
 * bien fundadas, así que siempre termina.
 */
import { TIEBREAKERS, type Tiebreaker } from '../tournament.types'
import { matchCounts } from './standings'
import type { StandingRow, StandingsConfig, StandingsMatch, StandingsTeam } from './types'

export type TiebreakContext = {
  /** SOLO los partidos del (stageId, groupLabel) que se está ordenando. */
  matches: readonly StandingsMatch[]
  teamById: ReadonlyMap<string, StandingsTeam>
  config: StandingsConfig
}

const KNOWN = new Set<string>(TIEBREAKERS)

/** Comparación lexicográfica de vectores numéricos, mayor primero. */
function cmpDesc(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Mini-liga entre los equipos empatados: se recalculan puntos, diferencia de
 * gol y goles a favor MIRANDO SOLO los cruces entre ellos.
 *
 * Con 2 equipos es "quién le ganó a quién". Con 3+ tiene que ser una mini-tabla
 * y no comparaciones de a pares: un empate circular (A>B, B>C, C>A) haría que
 * el sort devuelva un orden distinto según por dónde arranque.
 */
function headToHeadKeys(
  bucket: readonly StandingRow[],
  ctx: TiebreakContext,
): Map<string, number[]> {
  const ids = new Set(bucket.map((r) => r.teamId))
  const acc = new Map<string, { pts: number; gf: number; ga: number }>()
  for (const r of bucket) acc.set(r.teamId, { pts: 0, gf: 0, ga: 0 })

  for (const m of ctx.matches) {
    if (!matchCounts(m)) continue
    if (!ids.has(m.homeTeamId!) || !ids.has(m.awayTeamId!)) continue
    for (const teamId of [m.homeTeamId!, m.awayTeamId!]) {
      const a = acc.get(teamId)!
      const isHome = teamId === m.homeTeamId
      a.gf += isHome ? m.homeScore! : m.awayScore!
      a.ga += isHome ? m.awayScore! : m.homeScore!
    }
    const { pointsWin, pointsDraw, pointsLoss } = ctx.config
    if (m.status === 'walkover') {
      if (m.walkoverWinnerTeamId === null) {
        // No se presentó ninguno: los dos pierden.
        acc.get(m.homeTeamId!)!.pts += pointsLoss
        acc.get(m.awayTeamId!)!.pts += pointsLoss
      } else {
        const loser =
          m.walkoverWinnerTeamId === m.homeTeamId ? m.awayTeamId! : m.homeTeamId!
        acc.get(m.walkoverWinnerTeamId)!.pts += pointsWin
        acc.get(loser)!.pts += pointsLoss
      }
    } else if (m.homeScore! > m.awayScore!) {
      acc.get(m.homeTeamId!)!.pts += pointsWin
      acc.get(m.awayTeamId!)!.pts += pointsLoss
    } else if (m.homeScore! < m.awayScore!) {
      acc.get(m.awayTeamId!)!.pts += pointsWin
      acc.get(m.homeTeamId!)!.pts += pointsLoss
    } else {
      acc.get(m.homeTeamId!)!.pts += pointsDraw
      acc.get(m.awayTeamId!)!.pts += pointsDraw
    }
  }

  const out = new Map<string, number[]>()
  for (const [teamId, a] of acc) out.set(teamId, [a.pts, a.gf - a.ga, a.gf])
  return out
}

/**
 * El head-to-head no se puede aplicar si todavía falta jugar un cruce entre los
 * empatados: desempataría con información incompleta y castigaría al que menos
 * jugó. 'canceled' no bloquea (ese partido no se va a jugar nunca).
 */
function headToHeadApplicable(
  bucket: readonly StandingRow[],
  ctx: TiebreakContext,
): boolean {
  const ids = new Set(bucket.map((r) => r.teamId))
  return !ctx.matches.some(
    (m) =>
      (m.status === 'scheduled' || m.status === 'postponed') &&
      m.homeTeamId !== null &&
      m.awayTeamId !== null &&
      ids.has(m.homeTeamId) &&
      ids.has(m.awayTeamId),
  )
}

/** Vector de comparación de una fila para un criterio dado. Mayor es mejor. */
function keyFor(
  criterion: Tiebreaker,
  row: StandingRow,
  ctx: TiebreakContext,
  h2h: Map<string, number[]> | null,
): number[] {
  switch (criterion) {
    case 'goal_diff':
      return [row.goalDiff]
    case 'goals_for':
      return [row.goalsFor]
    case 'goals_against':
      // Menos es mejor.
      return [-row.goalsAgainst]
    case 'wins':
      return [row.won]
    case 'fair_play':
      // Menos es mejor.
      return [-row.fairPlayPoints]
    case 'drawn_lots': {
      // No sortea: ordena por el número de siembra cargado en el equipo. El
      // sorteo físico se registra escribiendo tournament_teams.seed.
      const seed = ctx.teamById.get(row.teamId)?.seed
      return [-(seed ?? Number.MAX_SAFE_INTEGER)]
    }
    case 'head_to_head':
      return h2h?.get(row.teamId) ?? [0, 0, 0]
  }
}

/** Orden terminal, total y determinista, cuando ningún criterio separó. */
function terminalOrder(
  bucket: readonly StandingRow[],
  ctx: TiebreakContext,
): StandingRow[] {
  return [...bucket].sort((a, b) => {
    const ta = ctx.teamById.get(a.teamId)
    const tb = ctx.teamById.get(b.teamId)
    const sa = ta?.seed ?? Number.MAX_SAFE_INTEGER
    const sb = tb?.seed ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    const na = ta?.nameNormalized ?? ''
    const nb = tb?.nameNormalized ?? ''
    if (na !== nb) return na < nb ? -1 : 1
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0
  })
}

function resolve(
  bucket: readonly StandingRow[],
  i: number,
  ctx: TiebreakContext,
): StandingRow[] {
  if (bucket.length <= 1) return [...bucket]

  const criteria = ctx.config.tiebreakers
  if (i >= criteria.length) {
    const out = terminalOrder(bucket, ctx)
    for (const row of out) {
      row.unresolvedTie = true
      row.decidedBy = 'none'
    }
    return out
  }

  const criterion = criteria[i]!
  // `tiebreakers` es un text[] sin CHECK en la base: un criterio desconocido se
  // saltea en vez de caer en un switch sin rama.
  if (!KNOWN.has(criterion)) return resolve(bucket, i + 1, ctx)

  let h2h: Map<string, number[]> | null = null
  if (criterion === 'head_to_head') {
    if (!headToHeadApplicable(bucket, ctx)) return resolve(bucket, i + 1, ctx)
    h2h = headToHeadKeys(bucket, ctx)
  }

  const withKeys = bucket.map((row) => ({ row, key: keyFor(criterion, row, ctx, h2h) }))
  withKeys.sort((a, b) => cmpDesc(a.key, b.key))

  // Partir en sub-buckets de key idéntica. Ya vienen ordenados, así que
  // alcanza con comparar contra la key anterior.
  const subBuckets: StandingRow[][] = []
  let prevKey: number[] | null = null
  for (const entry of withKeys) {
    if (prevKey !== null && cmpDesc(prevKey, entry.key) === 0) {
      subBuckets[subBuckets.length - 1]!.push(entry.row)
    } else {
      subBuckets.push([entry.row])
    }
    prevKey = entry.key
  }

  // El criterio no separó nada: probar el siguiente sobre el mismo bucket.
  if (subBuckets.length === 1) return resolve(bucket, i + 1, ctx)

  const out: StandingRow[] = []
  subBuckets.forEach((sub, idx) => {
    // Cada subgrupo reinicia la lista de criterios (variante FIFA).
    const resolved = resolve(sub, 0, ctx)
    if (idx < subBuckets.length - 1) {
      resolved[resolved.length - 1]!.decidedBy = criterion
    }
    out.push(...resolved)
  })
  return out
}

/**
 * Ordena un bucket de filas empatadas en puntos. Siempre devuelve un orden
 * TOTAL: si ningún criterio alcanza, cae al orden terminal y marca las filas
 * con `unresolvedTie`.
 */
export function orderGroup(
  bucket: readonly StandingRow[],
  ctx: TiebreakContext,
): StandingRow[] {
  return resolve(bucket, 0, ctx)
}
