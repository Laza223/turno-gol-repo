import { describe, expect, it } from 'vitest'
import {
  matchOutcome,
  qualifiedSeeds,
  qualifierLabel,
} from '@/modules/tournaments/standings/bracket'
import { StandingsTieUnresolvedError } from '@/modules/tournaments/tournament.errors'
import type {
  StandingRow,
  StandingsGroup,
  StandingsMatch,
} from '@/modules/tournaments/standings/types'

function match(over: Partial<StandingsMatch> & { id: string }): StandingsMatch {
  return {
    stageId: 's1',
    stageOrderIndex: 0,
    stageKind: 'knockout',
    groupLabel: null,
    round: 1,
    bracketSlot: null,
    startsAt: null,
    status: 'played',
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    walkoverWinnerTeamId: null,
    ...over,
  }
}

function row(teamId: string, over: Partial<StandingRow> = {}): StandingRow {
  return {
    position: 1,
    teamId,
    teamName: teamId,
    teamStatus: 'confirmed',
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
    ...over,
  }
}

function group(label: string, teamIds: string[]): StandingsGroup {
  return {
    stageId: 'zonas',
    groupLabel: label,
    rows: teamIds.map((id, i) => row(id, { position: i + 1 })),
  }
}

describe('matchOutcome', () => {
  it('gana el del marcador más alto', () => {
    expect(matchOutcome(match({ id: 'm', homeScore: 2, awayScore: 1 }))).toEqual({
      winnerTeamId: 'A',
      loserTeamId: 'B',
    })
    expect(matchOutcome(match({ id: 'm', homeScore: 0, awayScore: 3 }))).toEqual({
      winnerTeamId: 'B',
      loserTeamId: 'A',
    })
  })

  it('un empate sin penales no decide nada', () => {
    expect(matchOutcome(match({ id: 'm', homeScore: 1, awayScore: 1 }))).toBeNull()
  })

  it('con penales decide la tanda', () => {
    expect(
      matchOutcome(
        match({ id: 'm', homeScore: 1, awayScore: 1, homePenalties: 4, awayPenalties: 5 }),
      ),
    ).toEqual({ winnerTeamId: 'B', loserTeamId: 'A' })
  })

  it('el walkover lo decide el ganador declarado, no el marcador', () => {
    expect(
      matchOutcome(
        match({
          id: 'm',
          status: 'walkover',
          homeScore: 0,
          awayScore: 0,
          walkoverWinnerTeamId: 'B',
        }),
      ),
    ).toEqual({ winnerTeamId: 'B', loserTeamId: 'A' })
  })

  it('si no se presentó ninguno, la llave no avanza', () => {
    expect(
      matchOutcome(
        match({
          id: 'm',
          status: 'walkover',
          homeScore: 0,
          awayScore: 0,
          walkoverWinnerTeamId: null,
        }),
      ),
    ).toBeNull()
  })

  it('un partido no cerrado o sin equipos no decide nada', () => {
    expect(matchOutcome(match({ id: 'm', status: 'scheduled' }))).toBeNull()
    expect(matchOutcome(match({ id: 'm', homeTeamId: null, homeScore: 1, awayScore: 0 }))).toBeNull()
    expect(matchOutcome(match({ id: 'm', status: 'played' }))).toBeNull()
  })
})

describe('qualifiedSeeds', () => {
  it('ordena rank-major: 1ºA, 1ºB, 2ºA, 2ºB', () => {
    const seeds = qualifiedSeeds([group('A', ['a1', 'a2', 'a3']), group('B', ['b1', 'b2', 'b3'])], 2)
    expect(seeds.map((s) => s.teamId)).toEqual(['a1', 'b1', 'a2', 'b2'])
    expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4])
    expect(seeds.map((s) => s.rank)).toEqual([1, 1, 2, 2])
  })

  it('saltea a los que se bajaron y sube el siguiente', () => {
    const g = group('A', ['a1', 'a2', 'a3'])
    g.rows[1]!.teamStatus = 'disqualified'
    const seeds = qualifiedSeeds([g, group('B', ['b1', 'b2'])], 2)
    // a2 descalificado: el 2do clasificado de la zona A pasa a ser a3.
    expect(seeds.map((s) => s.teamId)).toEqual(['a1', 'b1', 'a3', 'b2'])
  })

  it('un empate irresoluble justo en el corte no deja sembrar', () => {
    const g = group('A', ['a1', 'a2', 'a3'])
    g.rows[1]!.unresolvedTie = true
    expect(() => qualifiedSeeds([g], 2)).toThrow(StandingsTieUnresolvedError)
  })

  it('un empate irresoluble que NO cruza la línea de corte no molesta', () => {
    const g = group('A', ['a1', 'a2', 'a3', 'a4'])
    g.rows[2]!.unresolvedTie = true
    g.rows[3]!.unresolvedTie = true
    expect(qualifiedSeeds([g], 2).map((s) => s.teamId)).toEqual(['a1', 'a2'])
  })
})

describe('qualifierLabel', () => {
  it('es la inversa exacta de qualifiedSeeds', () => {
    // Con 2 zonas: seed 1 = 1ºA, 2 = 1ºB, 3 = 2ºA, 4 = 2ºB.
    expect(qualifierLabel(1, 2)).toBe('1º Zona A')
    expect(qualifierLabel(2, 2)).toBe('1º Zona B')
    expect(qualifierLabel(3, 2)).toBe('2º Zona A')
    expect(qualifierLabel(4, 2)).toBe('2º Zona B')
  })

  it('la etiqueta coincide con el equipo que qualifiedSeeds pone en ese seed', () => {
    const groups = [group('A', ['a1', 'a2']), group('B', ['b1', 'b2'])]
    const seeds = qualifiedSeeds(groups, 2)
    for (const s of seeds) {
      expect(qualifierLabel(s.seed, groups.length)).toBe(`${s.rank}º Zona ${s.groupLabel}`)
    }
  })
})
