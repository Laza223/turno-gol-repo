import { describe, expect, it } from 'vitest'
import { computeStandings } from '@/modules/tournaments/standings/standings'
import type { Tiebreaker } from '@/modules/tournaments/tournament.types'
import type {
  StandingsEvent,
  StandingsMatch,
  StandingsTeam,
} from '@/modules/tournaments/standings/types'

function team(id: string, extra: Partial<StandingsTeam> = {}): StandingsTeam {
  return {
    id,
    name: id,
    nameNormalized: id.toLowerCase(),
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

function played(id: string, home: string, away: string, hs: number, as: number) {
  return match({ id, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as })
}

function order(
  teams: StandingsTeam[],
  matches: StandingsMatch[],
  tiebreakers: Tiebreaker[],
  events: StandingsEvent[] = [],
): string[] {
  const groups = computeStandings({
    teams,
    matches,
    events,
    config: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers },
  })
  return groups[0]!.rows.map((r) => r.teamId)
}

describe('desempate — criterios simples', () => {
  it('diferencia de gol', () => {
    // A y B: 3 puntos cada uno, A +3 y B +1. C y D: 0 puntos, C -3 y D -1, así
    // que el bucket de abajo también se ordena por diferencia y D va antes.
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [played('m1', 'A', 'C', 3, 0), played('m2', 'B', 'D', 1, 0)]
    expect(order(teams, matches, ['goal_diff'])).toEqual(['A', 'B', 'D', 'C'])
  })

  it('goles a favor cuando la diferencia empata', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')]
    // A gana 3-2 (+1, 3 GF), B gana 1-0 (+1, 1 GF).
    const matches = [played('m1', 'A', 'C', 3, 2), played('m2', 'B', 'D', 1, 0)]
    expect(order(teams, matches, ['goal_diff', 'goals_for'])).toEqual(['A', 'B', 'C', 'D'])
  })

  it('goles en contra: menos es mejor', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')]
    // A gana 1-0 (0 GC), B gana 3-2 (2 GC). Misma diferencia no: 1 vs 1. Sí.
    const matches = [played('m1', 'A', 'C', 1, 0), played('m2', 'B', 'D', 3, 2)]
    expect(order(teams, matches, ['goals_against'])).toEqual(['A', 'B', 'C', 'D'])
  })

  it('fair play: menos tarjetas es mejor', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [played('m1', 'A', 'C', 1, 0), played('m2', 'B', 'D', 1, 0)]
    const events: StandingsEvent[] = [
      {
        id: 'e1',
        matchId: 'm2',
        teamId: 'B',
        teamPlayerId: 'p',
        type: 'yellow_card',
        suspensionMatches: null,
      },
    ]
    expect(order(teams, matches, ['fair_play'], events)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('victorias', () => {
    const teams = [team('A'), team('B'), team('C'), team('D'), team('E'), team('F')]
    // A: 1 ganado + 3 empatados = 6 pts, 1 victoria.
    // B: 2 ganados = 6 pts, 2 victorias… armado abajo con marcadores iguales.
    const matches = [
      played('a1', 'A', 'C', 1, 0),
      played('a2', 'A', 'D', 1, 1),
      played('a3', 'A', 'E', 1, 1),
      played('a4', 'A', 'F', 1, 1),
      played('b1', 'B', 'C', 1, 0),
      played('b2', 'B', 'D', 1, 0),
    ]
    const result = order(teams, matches, ['wins'])
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('A'))
  })

  it('un criterio desconocido se saltea en vez de romper', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [played('m1', 'A', 'C', 3, 0), played('m2', 'B', 'D', 1, 0)]
    // 'inventado' no está en TIEBREAKERS: se saltea y decide goal_diff.
    const tiebreakers = ['inventado', 'goal_diff'] as unknown as Tiebreaker[]
    expect(order(teams, matches, tiebreakers)).toEqual(['A', 'B', 'D', 'C'])
  })
})

describe('desempate — head to head', () => {
  it('con dos equipos es quién le ganó a quién', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [
      played('m1', 'A', 'C', 2, 0),
      played('m2', 'B', 'D', 2, 0),
      // El único cruce entre los dos empatados: lo gana B.
      played('m3', 'A', 'B', 0, 1),
      played('m4', 'C', 'D', 0, 1),
      played('m5', 'A', 'D', 1, 0),
      played('m6', 'B', 'C', 1, 0),
    ]
    const result = order(teams, matches, ['head_to_head'])
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('A'))
  })

  it('un triple empate se resuelve por mini-liga, no comparando de a pares', () => {
    // A, B, C empatados en puntos. Entre ellos: A le ganó a B y a C; B le ganó
    // a C. La mini-liga da A > B > C.
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [
      played('h1', 'A', 'B', 1, 0),
      played('h2', 'A', 'C', 1, 0),
      played('h3', 'B', 'C', 1, 0),
      // D los empareja en puntos totales ganándole a A y perdiendo con B y C.
      played('d1', 'D', 'A', 1, 0),
      played('d2', 'B', 'D', 1, 0),
      played('d3', 'C', 'D', 1, 0),
    ]
    const result = order(teams, matches, ['head_to_head'])
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'))
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('C'))
  })

  it('un empate circular no rompe y da el mismo orden en dos corridas', () => {
    // A>B, B>C, C>A, todos 1-0: misma mini-tabla para los tres.
    const teams = [team('A'), team('B'), team('C')]
    const matches = [
      played('m1', 'A', 'B', 1, 0),
      played('m2', 'B', 'C', 1, 0),
      played('m3', 'C', 'A', 1, 0),
    ]
    const a = order(teams, matches, ['head_to_head'])
    const b = order(teams, matches, ['head_to_head'])
    expect(a).toEqual(b)
    expect(a).toHaveLength(3)
  })

  it('no se aplica si todavía falta jugar un cruce entre los empatados', () => {
    // A y B empatados; el cruce A-B está programado, no jugado. El criterio se
    // saltea y decide el siguiente (goles a favor), sin castigar a nadie.
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [
      played('m1', 'A', 'C', 3, 1),
      played('m2', 'B', 'D', 1, 0),
      match({ id: 'm3', homeTeamId: 'A', awayTeamId: 'B', status: 'scheduled' }),
    ]
    // Mismos puntos (3), distinta diferencia: A +2, B +1 → goal_diff separa.
    const result = order(teams, matches, ['head_to_head', 'goal_diff'])
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'))
  })

  it('la zona no mira el cruce de playoffs entre los mismos equipos', () => {
    // A y B empatados en la zona. En playoffs B le gana a A, pero eso NO puede
    // desempatar la zona.
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [
      match({
        id: 'z1',
        stageKind: 'group_stage',
        groupLabel: 'A',
        homeTeamId: 'A',
        awayTeamId: 'C',
        homeScore: 2,
        awayScore: 0,
      }),
      match({
        id: 'z2',
        stageKind: 'group_stage',
        groupLabel: 'A',
        homeTeamId: 'B',
        awayTeamId: 'D',
        homeScore: 1,
        awayScore: 0,
      }),
      // Cruce de playoffs: otra fase, no entra al desempate de la zona.
      match({
        id: 'p1',
        stageId: 'playoffs',
        stageOrderIndex: 1,
        stageKind: 'knockout',
        homeTeamId: 'B',
        awayTeamId: 'A',
        homeScore: 5,
        awayScore: 0,
      }),
    ]
    // head_to_head no aplica (no hay cruce de zona entre A y B) → cae a
    // goal_diff, donde A (+2) supera a B (+1).
    const result = order(teams, matches, ['head_to_head', 'goal_diff'])
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'))
  })
})

describe('desempate — sorteo y orden terminal', () => {
  it('drawn_lots ordena por el número de siembra cargado', () => {
    const teams = [team('A', { seed: 2 }), team('B', { seed: 1 })]
    const matches = [played('m1', 'A', 'B', 0, 0)]
    expect(order(teams, matches, ['drawn_lots'])).toEqual(['B', 'A'])
  })

  it('sin nada que los separe caen al orden terminal y quedan marcados', () => {
    const teams = [team('Zeta'), team('Alfa')]
    const matches = [played('m1', 'Zeta', 'Alfa', 1, 1)]
    const groups = computeStandings({
      teams,
      matches,
      events: [],
      config: {
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        tiebreakers: ['goal_diff', 'goals_for'],
      },
    })
    const rows = groups[0]!.rows
    // Orden terminal por nombre normalizado.
    expect(rows.map((r) => r.teamId)).toEqual(['Alfa', 'Zeta'])
    expect(rows.every((r) => r.unresolvedTie)).toBe(true)
    expect(rows.every((r) => r.decidedBy === 'none')).toBe(true)
  })

  it('el orden terminal es determinista entre corridas', () => {
    const teams = [team('C'), team('A'), team('B')]
    const matches = [
      played('m1', 'A', 'B', 0, 0),
      played('m2', 'B', 'C', 0, 0),
      played('m3', 'A', 'C', 0, 0),
    ]
    expect(order(teams, matches, ['goal_diff'])).toEqual(order(teams, matches, ['goal_diff']))
  })
})

describe('desempate — subgrupos reinician los criterios (FIFA)', () => {
  it('un empate de 3 donde la mini-liga deja 2 vuelve a aplicar la lista', () => {
    // A, B, C empatados. head_to_head parte {A} y {B,C}; entre B y C la
    // mini-liga no separa, así que el subgrupo reinicia y decide goal_diff.
    const teams = [team('A'), team('B'), team('C'), team('D')]
    const matches = [
      // Cruces entre los tres: A gana los dos; B y C empatan.
      played('h1', 'A', 'B', 1, 0),
      played('h2', 'A', 'C', 1, 0),
      played('h3', 'B', 'C', 0, 0),
      // D nivela los puntos y le da a B mejor diferencia que a C.
      played('d1', 'D', 'A', 2, 0),
      played('d2', 'B', 'D', 3, 0),
      played('d3', 'C', 'D', 1, 0),
    ]
    const result = order(teams, matches, ['head_to_head', 'goal_diff'])
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'))
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('C'))
  })
})
