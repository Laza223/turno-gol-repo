/**
 * Tipos del motor de posiciones. Hermano de `fixture/`: sin imports
 * server-only, para que lo consuman los unit tests y las stories.
 */
import type {
  Tiebreaker,
  TournamentEventType,
  TournamentMatchStatus,
  TournamentStageKind,
  TournamentTeamStatus,
} from '../tournament.types'

export type StandingsMatch = {
  id: string
  stageId: string
  /** order_index de la fase: 0 = la primera que se juega. */
  stageOrderIndex: number
  stageKind: TournamentStageKind
  groupLabel: string | null
  round: number
  bracketSlot: number | null
  startsAt: Date | null
  status: TournamentMatchStatus
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
  /** Solo definen la llave: NO suman a goles a favor / en contra. */
  homePenalties: number | null
  awayPenalties: number | null
  /** null con status='walkover' = no se presentó ninguno de los dos. */
  walkoverWinnerTeamId: string | null
}

export type StandingsEvent = {
  id: string
  matchId: string
  /** Equipo del AUTOR. En own_goal el gol suma al rival. */
  teamId: string
  teamPlayerId: string | null
  type: TournamentEventType
  /** Override del tribunal para esta roja. 0 = indulto. */
  suspensionMatches: number | null
}

export type StandingsTeam = {
  id: string
  name: string
  nameNormalized: string
  seed: number | null
  status: TournamentTeamStatus
}

export type StandingsConfig = {
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: readonly Tiebreaker[]
}

export type StandingRow = {
  position: number
  teamId: string
  teamName: string
  teamStatus: TournamentTeamStatus
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
  yellowCards: number
  redCards: number
  /** Menos es mejor: amarilla 1, roja 3. */
  fairPlayPoints: number
  /** Qué separó a ESTA fila de la de abajo. 'none' = nada la separó. */
  decidedBy: Tiebreaker | 'points' | 'none'
  /** true si ningún criterio pudo separarla de sus empatados. */
  unresolvedTie: boolean
}

export type StandingsGroup = {
  stageId: string
  /** null = la fase no tiene zonas (liga). */
  groupLabel: string | null
  rows: StandingRow[]
}

export type StandingsInput = {
  teams: readonly StandingsTeam[]
  matches: readonly StandingsMatch[]
  events: readonly StandingsEvent[]
  config: StandingsConfig
}
