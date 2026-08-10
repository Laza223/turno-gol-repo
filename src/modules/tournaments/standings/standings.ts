/**
 * Tabla de posiciones. Función PURA sobre partidos + eventos + config.
 *
 * Nada de esto se materializa: US-TOR-005 pide que un gol cargado por error se
 * pueda borrar, y con contadores en la base eso obliga a invalidar y recalcular
 * en cada borrado. Derivar al leer no puede desincronizarse.
 *
 * Dos invariantes que se ganaron a fuerza de bug:
 *  - Los goles a favor / en contra salen SIEMPRE del marcador, nunca de los
 *    eventos. Los goles-evento son ATRIBUCIÓN (quién lo hizo); el marcador es
 *    el HECHO. Así los puntos y la diferencia de gol salen de los mismos
 *    partidos y no pueden discrepar.
 *  - El resultado de un walkover sale de `walkoverWinnerTeamId`, NUNCA del
 *    marcador: un torneo con `walkover_goals_for = 0` (valor legal) daría 0-0 y
 *    se leería como empate.
 */
import type {
  StandingRow,
  StandingsEvent,
  StandingsGroup,
  StandingsInput,
  StandingsMatch,
  StandingsTeam,
} from './types'
import { orderGroup } from './tiebreakers'

const FAIR_PLAY_YELLOW_POINTS = 1
const FAIR_PLAY_RED_POINTS = 3

/** Un partido computa si y solo si está cerrado y tiene todo lo necesario. */
export function matchCounts(m: StandingsMatch): boolean {
  if (m.status !== 'played' && m.status !== 'walkover') return false
  if (m.homeTeamId === null || m.awayTeamId === null) return false
  return m.homeScore !== null && m.awayScore !== null
}

/**
 * El equipo al que SUMA el gol de este evento. En un gol en contra el autor es
 * de un equipo y el gol es del otro.
 */
export function scoringTeamId(
  ev: Pick<StandingsEvent, 'teamId' | 'type'>,
  m: Pick<StandingsMatch, 'homeTeamId' | 'awayTeamId'>,
): string | null {
  if (ev.type !== 'goal' && ev.type !== 'own_goal') return null
  if (ev.type === 'goal') return ev.teamId
  // own_goal: suma al rival.
  if (ev.teamId === m.homeTeamId) return m.awayTeamId
  if (ev.teamId === m.awayTeamId) return m.homeTeamId
  return null
}

/** Clave de agrupamiento: una tabla por fase y por zona. */
function groupKeyOf(m: StandingsMatch): string {
  return `${m.stageId}::${m.groupLabel ?? ''}`
}

function emptyRow(team: StandingsTeam): StandingRow {
  return {
    position: 0,
    teamId: team.id,
    teamName: team.name,
    teamStatus: team.status,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    yellowCards: 0,
    redCards: 0,
    fairPlayPoints: 0,
    decidedBy: 'none',
    unresolvedTie: false,
  }
}

/**
 * Resultado de un partido computable desde el punto de vista de cada lado.
 * 'loss' para los dos en un doble walkover: no se presentó nadie, no es empate.
 */
function outcomeFor(
  m: StandingsMatch,
  teamId: string,
): 'win' | 'draw' | 'loss' {
  if (m.status === 'walkover') {
    if (m.walkoverWinnerTeamId === null) return 'loss'
    return m.walkoverWinnerTeamId === teamId ? 'win' : 'loss'
  }
  // 'played': decide el marcador. Los penales NO se miran acá: definen la
  // llave, no la tabla.
  const own = teamId === m.homeTeamId ? m.homeScore! : m.awayScore!
  const other = teamId === m.homeTeamId ? m.awayScore! : m.homeScore!
  if (own > other) return 'win'
  if (own < other) return 'loss'
  return 'draw'
}

export function computeStandings(input: StandingsInput): StandingsGroup[] {
  const { config } = input
  const teamById = new Map(input.teams.map((t) => [t.id, t]))

  // Solo las fases que tienen tabla. El filtro va acá y no solo en el service:
  // un torneo de grupos+playoffs no debe producir una "zona" espuria por llave.
  const tabulables = input.matches.filter(
    (m) => m.stageKind === 'league' || m.stageKind === 'group_stage',
  )

  const byGroup = new Map<string, StandingsMatch[]>()
  for (const m of tabulables) {
    const key = groupKeyOf(m)
    const list = byGroup.get(key) ?? []
    list.push(m)
    byGroup.set(key, list)
  }

  const groups: StandingsGroup[] = []

  for (const [, matches] of byGroup) {
    const first = matches[0]!

    // El roster sale de los partidos, no de tournament_teams.group_label: un
    // equipo con cero fechas jugadas tiene que aparecer en la tabla en cero.
    const rowByTeam = new Map<string, StandingRow>()
    for (const m of matches) {
      for (const id of [m.homeTeamId, m.awayTeamId]) {
        if (id === null || rowByTeam.has(id)) continue
        const team = teamById.get(id)
        if (team) rowByTeam.set(id, emptyRow(team))
      }
    }

    // Solo los partidos computables de ESTE grupo alimentan la tabla...
    const counted = matches.filter(matchCounts)
    const countedIds = new Set(counted.map((m) => m.id))

    for (const m of counted) {
      for (const teamId of [m.homeTeamId!, m.awayTeamId!]) {
        const row = rowByTeam.get(teamId)
        if (!row) continue
        const isHome = teamId === m.homeTeamId
        row.played += 1
        row.goalsFor += isHome ? m.homeScore! : m.awayScore!
        row.goalsAgainst += isHome ? m.awayScore! : m.homeScore!
        const outcome = outcomeFor(m, teamId)
        if (outcome === 'win') row.won += 1
        else if (outcome === 'draw') row.drawn += 1
        else row.lost += 1
      }
    }

    // ...y solo las tarjetas de esos mismos partidos cuentan para fair play.
    // Sin este filtro entrarían tarjetas de partidos postergados o de los
    // playoffs al desempate de la zona.
    const matchById = new Map(counted.map((m) => [m.id, m]))
    for (const ev of input.events) {
      if (!countedIds.has(ev.matchId)) continue
      if (ev.type !== 'yellow_card' && ev.type !== 'red_card') continue
      const m = matchById.get(ev.matchId)!
      // La tarjeta se le carga al equipo del jugador, no al rival.
      const teamId = ev.teamId === m.homeTeamId ? m.homeTeamId : m.awayTeamId
      const row = rowByTeam.get(teamId!)
      if (!row) continue
      if (ev.type === 'yellow_card') row.yellowCards += 1
      else row.redCards += 1
    }

    for (const row of rowByTeam.values()) {
      row.goalDiff = row.goalsFor - row.goalsAgainst
      row.points =
        row.won * config.pointsWin +
        row.drawn * config.pointsDraw +
        row.lost * config.pointsLoss
      row.fairPlayPoints =
        row.yellowCards * FAIR_PLAY_YELLOW_POINTS + row.redCards * FAIR_PLAY_RED_POINTS
    }

    // Partición por puntos; cada bucket empatado va al desempate.
    const all = [...rowByTeam.values()].sort((a, b) => b.points - a.points)
    const ordered: StandingRow[] = []
    let i = 0
    while (i < all.length) {
      let j = i
      while (j < all.length && all[j]!.points === all[i]!.points) j++
      const bucket = all.slice(i, j)
      const resolved =
        bucket.length === 1
          ? bucket
          : orderGroup(bucket, { matches, teamById, config })
      // La última fila de un bucket de puntos queda separada de la siguiente
      // por los puntos, no por un criterio de desempate.
      if (j < all.length) resolved[resolved.length - 1]!.decidedBy = 'points'
      ordered.push(...resolved)
      i = j
    }

    ordered.forEach((row, idx) => {
      row.position = idx + 1
    })

    groups.push({
      stageId: first.stageId,
      groupLabel: first.groupLabel,
      rows: ordered,
    })
  }

  // Orden estable de las zonas: A, B, C…
  groups.sort((a, b) => (a.groupLabel ?? '').localeCompare(b.groupLabel ?? ''))
  return groups
}
