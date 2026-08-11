import { describe, expect, it } from 'vitest'
import {
  computeStandings,
  matchCounts,
  scoringTeamId,
} from '@/modules/tournaments/standings/standings'
import type {
  StandingsConfig,
  StandingsEvent,
  StandingsMatch,
  StandingsTeam,
} from '@/modules/tournaments/standings/types'

const CONFIG: StandingsConfig = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['goal_diff', 'goals_for'],
}

function team(id: string, name = id, extra: Partial<StandingsTeam> = {}): StandingsTeam {
  return {
    id,
    name,
    nameNormalized: name.toLowerCase(),
    seed: null,
    status: 'confirmed',
    ...extra,
  }
}

function match(over: Partial<StandingsMatch> & { id: string }): StandingsMatch {
  return {
    stageId: 's1',
    stageOrderIndex: 0,
    stageKind: 'league',
    groupLabel: null,
    round: 1,
    bracketSlot: null,
    startsAt: null,
    status: 'played',
    homeTeamId: null,
    awayTeamId: null,
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    walkoverWinnerTeamId: null,
    ...over,
  }
}

/** Partido jugado con marcador. */
function played(id: string, home: string, away: string, hs: number, as: number) {
  return match({ id, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as })
}

const rowOf = (groups: ReturnType<typeof computeStandings>, teamId: string) =>
  groups[0]!.rows.find((r) => r.teamId === teamId)!

describe('matchCounts', () => {
  it('solo cuenta played y walkover con todo cargado', () => {
    expect(matchCounts(played('m', 'A', 'B', 1, 0))).toBe(true)
    expect(matchCounts(match({ id: 'm', status: 'scheduled' }))).toBe(false)
    expect(matchCounts(match({ id: 'm', status: 'postponed' }))).toBe(false)
    expect(matchCounts(match({ id: 'm', status: 'canceled' }))).toBe(false)
    // Jugado pero sin marcador: no computa.
    expect(matchCounts(match({ id: 'm', homeTeamId: 'A', awayTeamId: 'B' }))).toBe(false)
    // Llave sin definir.
    expect(matchCounts(match({ id: 'm', homeScore: 1, awayScore: 0 }))).toBe(false)
  })
})

describe('scoringTeamId', () => {
  const m = { homeTeamId: 'A', awayTeamId: 'B' }

  it('un gol suma al equipo del autor', () => {
    expect(scoringTeamId({ teamId: 'A', type: 'goal' }, m)).toBe('A')
  })

  it('un gol en contra suma al RIVAL', () => {
    expect(scoringTeamId({ teamId: 'A', type: 'own_goal' }, m)).toBe('B')
    expect(scoringTeamId({ teamId: 'B', type: 'own_goal' }, m)).toBe('A')
  })

  it('las tarjetas no suman goles', () => {
    expect(scoringTeamId({ teamId: 'A', type: 'yellow_card' }, m)).toBeNull()
    expect(scoringTeamId({ teamId: 'A', type: 'red_card' }, m)).toBeNull()
  })
})

describe('computeStandings — puntos y acumulados', () => {
  it('suma con la configuración de puntos del torneo', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B'), team('C')],
      matches: [played('m1', 'A', 'B', 2, 0), played('m2', 'B', 'C', 1, 1)],
      events: [],
      config: CONFIG,
    })

    expect(rowOf(groups, 'A').points).toBe(3)
    expect(rowOf(groups, 'B').points).toBe(1)
    expect(rowOf(groups, 'C').points).toBe(1)
    expect(rowOf(groups, 'A').goalDiff).toBe(2)
    expect(rowOf(groups, 'B').goalDiff).toBe(-2)
  })

  it('respeta una configuración no estándar (2-1-0)', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [played('m1', 'A', 'B', 1, 0)],
      events: [],
      config: { ...CONFIG, pointsWin: 2 },
    })
    expect(rowOf(groups, 'A').points).toBe(2)
  })

  it('scheduled, postponed y canceled no suman nada', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [
        match({ id: 'm1', homeTeamId: 'A', awayTeamId: 'B', status: 'scheduled' }),
        match({
          id: 'm2',
          homeTeamId: 'A',
          awayTeamId: 'B',
          status: 'postponed',
          homeScore: 5,
          awayScore: 0,
        }),
        match({
          id: 'm3',
          homeTeamId: 'A',
          awayTeamId: 'B',
          status: 'canceled',
          homeScore: 5,
          awayScore: 0,
        }),
      ],
      events: [],
      config: CONFIG,
    })
    expect(rowOf(groups, 'A').played).toBe(0)
    expect(rowOf(groups, 'A').points).toBe(0)
  })

  it('un equipo con cero fechas jugadas aparece igual, en cero', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [match({ id: 'm1', homeTeamId: 'A', awayTeamId: 'B', status: 'scheduled' })],
      events: [],
      config: CONFIG,
    })
    expect(groups[0]!.rows).toHaveLength(2)
    expect(rowOf(groups, 'A').played).toBe(0)
  })

  it('los penales NO suman a goles a favor ni en contra', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [
        match({
          id: 'm1',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 1,
          awayScore: 1,
          homePenalties: 5,
          awayPenalties: 4,
        }),
      ],
      events: [],
      config: CONFIG,
    })
    expect(rowOf(groups, 'A').goalsFor).toBe(1)
    expect(rowOf(groups, 'A').drawn).toBe(1)
    expect(rowOf(groups, 'A').won).toBe(0)
  })
})

describe('computeStandings — walkover', () => {
  it('el ganador suma los goles configurados y el rival pierde', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [
        match({
          id: 'm1',
          status: 'walkover',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 3,
          awayScore: 0,
          walkoverWinnerTeamId: 'A',
        }),
      ],
      events: [],
      config: CONFIG,
    })
    expect(rowOf(groups, 'A').won).toBe(1)
    expect(rowOf(groups, 'A').goalsFor).toBe(3)
    expect(rowOf(groups, 'B').lost).toBe(1)
  })

  it('con walkover_goals_for = 0 sigue siendo victoria, NO empate', () => {
    // El bug clásico: un 0-0 con status walkover se leería como empate si el
    // resultado saliera del marcador en vez de walkover_winner_team_id.
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [
        match({
          id: 'm1',
          status: 'walkover',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 0,
          awayScore: 0,
          walkoverWinnerTeamId: 'A',
        }),
      ],
      events: [],
      config: CONFIG,
    })
    expect(rowOf(groups, 'A').won).toBe(1)
    expect(rowOf(groups, 'A').points).toBe(3)
    expect(rowOf(groups, 'A').drawn).toBe(0)
    expect(rowOf(groups, 'B').lost).toBe(1)
    expect(rowOf(groups, 'B').points).toBe(0)
  })

  it('si no se presentó ninguno, pierden los dos', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [
        match({
          id: 'm1',
          status: 'walkover',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 0,
          awayScore: 0,
          walkoverWinnerTeamId: null,
        }),
      ],
      events: [],
      config: CONFIG,
    })
    for (const id of ['A', 'B']) {
      expect(rowOf(groups, id).played).toBe(1)
      expect(rowOf(groups, id).lost).toBe(1)
      expect(rowOf(groups, id).drawn).toBe(0)
      expect(rowOf(groups, id).points).toBe(0)
    }
  })
})

describe('computeStandings — fases y zonas', () => {
  it('un grupos+playoffs solo produce tabla de la fase de grupos', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B'), team('C'), team('D')],
      matches: [
        match({
          id: 'z1',
          stageId: 'zonas',
          stageKind: 'group_stage',
          groupLabel: 'A',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 1,
          awayScore: 0,
        }),
        match({
          id: 'z2',
          stageId: 'zonas',
          stageKind: 'group_stage',
          groupLabel: 'B',
          homeTeamId: 'C',
          awayTeamId: 'D',
          homeScore: 2,
          awayScore: 2,
        }),
        match({
          id: 'p1',
          stageId: 'playoffs',
          stageOrderIndex: 1,
          stageKind: 'knockout',
          homeTeamId: 'A',
          awayTeamId: 'C',
          homeScore: 3,
          awayScore: 0,
        }),
      ],
      events: [],
      config: CONFIG,
    })

    // Zona A y zona B, y NINGUNA "zona" espuria por la llave.
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.groupLabel)).toEqual(['A', 'B'])
    // El 3-0 del playoff no infló la diferencia de gol de A en su zona.
    expect(groups[0]!.rows.find((r) => r.teamId === 'A')!.goalsFor).toBe(1)
  })

  it('el fair play no cuenta tarjetas de partidos no computables ni de playoffs', () => {
    const events: StandingsEvent[] = [
      {
        id: 'e1',
        matchId: 'z1',
        teamId: 'A',
        teamPlayerId: 'p1',
        type: 'yellow_card',
        suspensionMatches: null,
      },
      // Partido postergado: no cuenta.
      {
        id: 'e2',
        matchId: 'z2',
        teamId: 'A',
        teamPlayerId: 'p1',
        type: 'red_card',
        suspensionMatches: null,
      },
      // Playoff: no cuenta para la zona.
      {
        id: 'e3',
        matchId: 'p1',
        teamId: 'A',
        teamPlayerId: 'p1',
        type: 'red_card',
        suspensionMatches: null,
      },
    ]
    const groups = computeStandings({
      teams: [team('A'), team('B')],
      matches: [
        match({
          id: 'z1',
          stageKind: 'group_stage',
          groupLabel: 'A',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 1,
          awayScore: 0,
        }),
        match({
          id: 'z2',
          stageKind: 'group_stage',
          groupLabel: 'A',
          status: 'postponed',
          homeTeamId: 'A',
          awayTeamId: 'B',
        }),
        match({
          id: 'p1',
          stageId: 'playoffs',
          stageOrderIndex: 1,
          stageKind: 'knockout',
          homeTeamId: 'A',
          awayTeamId: 'B',
          homeScore: 1,
          awayScore: 0,
        }),
      ],
      events,
      config: CONFIG,
    })
    const a = rowOf(groups, 'A')
    expect(a.yellowCards).toBe(1)
    expect(a.redCards).toBe(0)
    expect(a.fairPlayPoints).toBe(1)
  })

  it('un equipo que se bajó queda en la tabla con sus puntos', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B', 'B', { status: 'withdrawn' })],
      matches: [played('m1', 'A', 'B', 0, 1)],
      events: [],
      config: CONFIG,
    })
    const b = rowOf(groups, 'B')
    expect(b.points).toBe(3)
    expect(b.teamStatus).toBe('withdrawn')
  })
})

describe('computeStandings — posiciones', () => {
  it('numera de 1 en adelante y marca qué separó cada fila', () => {
    const groups = computeStandings({
      teams: [team('A'), team('B'), team('C')],
      matches: [
        played('m1', 'A', 'B', 3, 0),
        played('m2', 'B', 'C', 1, 0),
        played('m3', 'A', 'C', 1, 0),
      ],
      events: [],
      config: CONFIG,
    })
    const rows = groups[0]!.rows
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C'])
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3])
    // A (6 pts) y B (3 pts) los separan los puntos.
    expect(rows[0]!.decidedBy).toBe('points')
  })
})
