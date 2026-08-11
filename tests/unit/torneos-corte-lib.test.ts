import { describe, expect, it } from 'vitest'
import { buildCorte } from '@/app/(admin)/torneos/[id]/posiciones/corte-lib'
import type { StandingsGroup } from '@/modules/tournaments/standings/types'
import type {
  TournamentMatchView,
  TournamentRow,
  TournamentStageRow,
  TournamentTeamRow,
} from '@/modules/tournaments/tournament.types'

/**
 * `buildCorte` (B16).
 *
 * Existe como módulo aparte por este archivo: la primera versión vivía adentro
 * de `posiciones/page.tsx` y filtraba los cruces por "la primera ronda del
 * cuadro". En un torneo de 3 zonas con 2 clasificados (6 clasificados, cuadro
 * con BYE) eso borraba de la pantalla a los dos mejores, que entran recién en
 * semifinales. La siembra real los sembraba bien; la vista previa no los
 * mostraba nunca, y no había forma de que un test lo agarrara.
 */

const GROUP_STAGE = 'stage-zonas'
const KO_STAGE = 'stage-playoffs'

function stages(groupsCount: number, advance: number): TournamentStageRow[] {
  const base = {
    tenantId: 't1',
    tournamentId: 'tour-1',
    legs: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  return [
    {
      ...base,
      id: GROUP_STAGE,
      name: 'Zonas',
      kind: 'group_stage',
      orderIndex: 0,
      groupsCount,
      teamsAdvancePerGroup: advance,
    },
    {
      ...base,
      id: KO_STAGE,
      name: 'Playoffs',
      kind: 'knockout',
      orderIndex: 1,
      groupsCount: null,
      teamsAdvancePerGroup: null,
    },
  ]
}

function tournament(overrides: Partial<TournamentRow> = {}): TournamentRow {
  return {
    id: 'tour-1',
    tenantId: 't1',
    name: 'Copa',
    slug: 'copa',
    format: 'groups_playoff',
    status: 'in_progress',
    startsOn: '2027-03-01',
    endsOn: null,
    registrationDeadline: null,
    maxTeams: null,
    matchDurationMinutes: 60,
    restBetweenMatchesMinutes: 0,
    inscriptionFee: 0,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    tiebreakers: ['goal_diff'],
    yellowCardsForSuspension: 3,
    redCardSuspensionMatches: 1,
    walkoverGoalsFor: 3,
    isPublic: false,
    notes: null,
    createdByStaff: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function match(overrides: Partial<TournamentMatchView>): TournamentMatchView {
  return {
    id: 'm',
    tenantId: 't1',
    tournamentId: 'tour-1',
    stageId: KO_STAGE,
    round: 1,
    groupLabel: null,
    bracketSlot: 0,
    homeTeamId: null,
    awayTeamId: null,
    homeSourceMatchId: null,
    awaySourceMatchId: null,
    isThirdPlace: false,
    courtId: null,
    bookingId: null,
    startsAt: null,
    endsAt: null,
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    walkoverWinnerTeamId: null,
    homeSourceSeed: null,
    awaySourceSeed: null,
    playedAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    homeTeamName: null,
    awayTeamName: null,
    courtName: null,
    ...overrides,
  }
}

function team(id: string, name: string, seed: number | null = null): TournamentTeamRow {
  return {
    id,
    tenantId: 't1',
    tournamentId: 'tour-1',
    name,
    contactPlayerId: null,
    contactName: null,
    contactPhone: null,
    status: 'confirmed',
    groupLabel: null,
    seed,
    inscriptionFee: 0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** Una zona con N equipos ya ordenados y sin empates sin resolver. */
function group(label: string, teams: Array<{ id: string; name: string }>): StandingsGroup {
  return {
    stageId: GROUP_STAGE,
    groupLabel: label,
    rows: teams.map((t, i) => ({
      position: i + 1,
      teamId: t.id,
      teamName: t.name,
      teamStatus: 'confirmed' as const,
      played: 2,
      won: 2 - i,
      drawn: 0,
      lost: i,
      goalsFor: 6 - i,
      goalsAgainst: i,
      goalDiff: 6 - 2 * i,
      points: (2 - i) * 3,
      yellowCards: 0,
      redCards: 0,
      fairPlayPoints: 0,
      decidedBy: 'points' as const,
      unresolvedTie: false,
    })),
  }
}

describe('buildCorte — cuándo aplica', () => {
  it('no aplica en una liga', () => {
    expect(
      buildCorte({
        tournament: tournament({ format: 'league' }),
        stages: stages(2, 2),
        groups: [],
        teams: [],
        matches: [],
      }),
    ).toBeNull()
  })

  it('no aplica sin fase de playoffs', () => {
    expect(
      buildCorte({
        tournament: tournament(),
        stages: [stages(2, 2)[0]!],
        groups: [],
        teams: [],
        matches: [],
      }),
    ).toBeNull()
  })

  it('no aplica sin fixture: no hay cruces que mostrar', () => {
    expect(
      buildCorte({
        tournament: tournament(),
        stages: stages(2, 2),
        groups: [],
        teams: [],
        matches: [],
      }),
    ).toBeNull()
  })
})

describe('buildCorte — cuadro sin BYE (2 zonas × 2 = 4 clasificados)', () => {
  const teams = [
    team('a1', 'Los Pibes'),
    team('a2', 'Atlético Fondo'),
    team('b1', 'Real Sociedad'),
    team('b2', 'FC Cerveza'),
  ]
  const groups = [
    group('A', [
      { id: 'a1', name: 'Los Pibes' },
      { id: 'a2', name: 'Atlético Fondo' },
    ]),
    group('B', [
      { id: 'b1', name: 'Real Sociedad' },
      { id: 'b2', name: 'FC Cerveza' },
    ]),
  ]
  // Semis (round 1) alimentadas por zonas + final (round 2) por ganadores.
  const matches = [
    match({ id: 'sf1', round: 1, bracketSlot: 0, homeSourceSeed: 1, awaySourceSeed: 4 }),
    match({ id: 'sf2', round: 1, bracketSlot: 1, homeSourceSeed: 2, awaySourceSeed: 3 }),
    match({
      id: 'final',
      round: 2,
      bracketSlot: 0,
      homeSourceMatchId: 'sf1',
      awaySourceMatchId: 'sf2',
    }),
  ]

  it('muestra los dos cruces sembrables y NO la final', () => {
    const corte = buildCorte({
      tournament: tournament(),
      stages: stages(2, 2),
      groups,
      teams,
      matches,
    })!

    expect(corte.crosses).toHaveLength(2)
    expect(corte.crosses.map((c) => c.id)).toEqual(['sf1', 'sf2'])
    expect(corte.crosses[0]!.homeLabel).toBe('1º Zona A')
    expect(corte.crosses[0]!.awayLabel).toBe('2º Zona B')
  })

  it('resuelve el nombre del equipo que va a caer en cada puesto', () => {
    const corte = buildCorte({
      tournament: tournament(),
      stages: stages(2, 2),
      groups,
      teams,
      matches,
    })!

    expect(corte.crosses[0]!.homeTeamName).toBe('Los Pibes')
    expect(corte.crosses[0]!.awayTeamName).toBe('FC Cerveza')
  })

  it('con una sola ronda sembrada todas las etiquetas de ronda son iguales', () => {
    const corte = buildCorte({
      tournament: tournament(),
      stages: stages(2, 2),
      groups,
      teams,
      matches,
    })!
    expect(new Set(corte.crosses.map((c) => c.round)).size).toBe(1)
  })
})

describe('buildCorte — cuadro CON BYE (3 zonas × 2 = 6 clasificados)', () => {
  const names = [
    ['a1', 'Zona A 1º'],
    ['a2', 'Zona A 2º'],
    ['b1', 'Zona B 1º'],
    ['b2', 'Zona B 2º'],
    ['c1', 'Zona C 1º'],
    ['c2', 'Zona C 2º'],
  ] as const
  const teams = names.map(([id, name]) => team(id, name))
  const groups = [
    group('A', [
      { id: 'a1', name: 'Zona A 1º' },
      { id: 'a2', name: 'Zona A 2º' },
    ]),
    group('B', [
      { id: 'b1', name: 'Zona B 1º' },
      { id: 'b2', name: 'Zona B 2º' },
    ]),
    group('C', [
      { id: 'c1', name: 'Zona C 1º' },
      { id: 'c2', name: 'Zona C 2º' },
    ]),
  ]

  /**
   * Con 6 clasificados el cuadro es de 8 con dos BYE: los seeds 1 y 2 entran
   * DIRECTO a semifinales, que es la ronda 2. Ése es el caso que la versión
   * anterior escondía.
   */
  const matches = [
    match({ id: 'qf1', round: 1, bracketSlot: 1, homeSourceSeed: 4, awaySourceSeed: 5 }),
    match({ id: 'qf2', round: 1, bracketSlot: 3, homeSourceSeed: 3, awaySourceSeed: 6 }),
    match({ id: 'sf1', round: 2, bracketSlot: 0, homeSourceSeed: 1, awaySourceMatchId: 'qf1' }),
    match({ id: 'sf2', round: 2, bracketSlot: 1, homeSourceSeed: 2, awaySourceMatchId: 'qf2' }),
    match({
      id: 'final',
      round: 3,
      bracketSlot: 0,
      homeSourceMatchId: 'sf1',
      awaySourceMatchId: 'sf2',
    }),
  ]

  const corte = () =>
    buildCorte({ tournament: tournament(), stages: stages(3, 2), groups, teams, matches })!

  it('incluye los cruces de la ronda 2: los equipos con BYE no desaparecen', () => {
    expect(corte().crosses.map((c) => c.id)).toEqual(['qf1', 'qf2', 'sf1', 'sf2'])
  })

  it('los dos mejores clasificados aparecen con su nombre', () => {
    const byName = Object.fromEntries(corte().crosses.map((c) => [c.id, c.homeTeamName]))
    expect(byName['sf1']).toBe('Zona A 1º')
    expect(byName['sf2']).toBe('Zona B 1º')
  })

  it('el lado que espera a un ganador se dice, no queda "A definir"', () => {
    const sf1 = corte().crosses.find((c) => c.id === 'sf1')!
    expect(sf1.awayLabel).toBe('Ganador de la llave anterior')
    expect(sf1.awayTeamName).toBeNull()
  })

  it('etiqueta cada ronda para que el cuadro se entienda', () => {
    const rounds = corte().crosses.map((c) => c.round)
    // 3 rondas en total: la 1 son cuartos y la 2 semis.
    expect(rounds).toEqual(['Cuartos de final', 'Cuartos de final', 'Semifinal', 'Semifinal'])
  })

  it('la final no entra: no se alimenta de ninguna zona', () => {
    expect(corte().crosses.some((c) => c.id === 'final')).toBe(false)
  })
})

describe('buildCorte — partidos de zona pendientes', () => {
  const base = {
    tournament: tournament(),
    stages: stages(2, 2),
    groups: [
      group('A', [
        { id: 'a1', name: 'A1' },
        { id: 'a2', name: 'A2' },
      ]),
      group('B', [
        { id: 'b1', name: 'B1' },
        { id: 'b2', name: 'B2' },
      ]),
    ],
    teams: [team('a1', 'A1'), team('a2', 'A2'), team('b1', 'B1'), team('b2', 'B2')],
  }
  const ko = match({ id: 'sf1', homeSourceSeed: 1, awaySourceSeed: 4 })

  it('cuenta igual que seedPlayoffs: played, walkover y canceled son cerrados', () => {
    const corte = buildCorte({
      ...base,
      matches: [
        ko,
        match({ id: 'g1', stageId: GROUP_STAGE, status: 'played' }),
        match({ id: 'g2', stageId: GROUP_STAGE, status: 'walkover' }),
        match({ id: 'g3', stageId: GROUP_STAGE, status: 'canceled' }),
        match({ id: 'g4', stageId: GROUP_STAGE, status: 'scheduled' }),
        match({ id: 'g5', stageId: GROUP_STAGE, status: 'postponed' }),
      ],
    })!

    expect(corte.pendingGroupMatches).toBe(2)
  })

  it('los partidos de playoffs no cuentan como zona pendiente', () => {
    const corte = buildCorte({ ...base, matches: [ko] })!
    expect(corte.pendingGroupMatches).toBe(0)
  })
})

describe('buildCorte — alreadySeeded', () => {
  const base = {
    tournament: tournament(),
    stages: stages(2, 2),
    groups: [
      group('A', [
        { id: 'a1', name: 'A1' },
        { id: 'a2', name: 'A2' },
      ]),
      group('B', [
        { id: 'b1', name: 'B1' },
        { id: 'b2', name: 'B2' },
      ]),
    ],
    teams: [team('a1', 'A1'), team('a2', 'A2'), team('b1', 'B1'), team('b2', 'B2')],
  }

  it('sin sembrar: ningún lado tiene equipo', () => {
    const corte = buildCorte({
      ...base,
      matches: [match({ id: 'sf1', homeSourceSeed: 1, awaySourceSeed: 4 })],
    })!
    expect(corte.alreadySeeded).toBe(false)
  })

  it('sembrado: alcanza con que un lado tenga equipo', () => {
    const corte = buildCorte({
      ...base,
      matches: [
        match({
          id: 'sf1',
          homeSourceSeed: 1,
          awaySourceSeed: 4,
          homeTeamId: 'a1',
          homeTeamName: 'A1',
        }),
      ],
    })!
    expect(corte.alreadySeeded).toBe(true)
  })

  it('un cruce con BYE sembrado del lado visitante también cuenta', () => {
    const corte = buildCorte({
      ...base,
      matches: [
        match({ id: 'sf1', homeSourceSeed: 1, awaySourceSeed: 4 }),
        match({
          id: 'sf2',
          round: 2,
          awaySourceSeed: 2,
          awayTeamId: 'b1',
          awayTeamName: 'B1',
          homeSourceMatchId: 'sf1',
        }),
      ],
    })!
    expect(corte.alreadySeeded).toBe(true)
  })

  it('con el cuadro sembrado, el nombre sale del propio partido y no de la tabla', () => {
    const corte = buildCorte({
      ...base,
      matches: [
        match({
          id: 'sf1',
          homeSourceSeed: 1,
          awaySourceSeed: 4,
          homeTeamId: 'a1',
          homeTeamName: 'Nombre ya guardado',
        }),
      ],
    })!
    expect(corte.crosses[0]!.homeTeamName).toBe('Nombre ya guardado')
  })
})

describe('buildCorte — empate irresoluble en la línea de corte', () => {
  it('devuelve los equipos empatados con id y seed, no solo el nombre', () => {
    const tied = group('A', [
      { id: 'a1', name: 'Los Pibes' },
      { id: 'a2', name: 'Atlético Fondo' },
    ])
    // Los dos comparten puntos y el de la línea de corte queda sin desempatar.
    tied.rows[1]!.points = tied.rows[0]!.points
    tied.rows[1]!.unresolvedTie = true
    tied.rows[0]!.unresolvedTie = true

    const corte = buildCorte({
      tournament: tournament(),
      stages: stages(1, 2),
      groups: [tied],
      teams: [team('a1', 'Los Pibes', 3), team('a2', 'Atlético Fondo')],
      matches: [match({ id: 'sf1', homeSourceSeed: 1, awaySourceSeed: 2 })],
    })!

    expect(corte.tie).toEqual({
      groupLabel: 'A',
      teams: [
        { teamId: 'a1', teamName: 'Los Pibes', seed: 3 },
        { teamId: 'a2', teamName: 'Atlético Fondo', seed: null },
      ],
    })
  })

  it('con empate no se resuelven nombres, pero el cuadro se dibuja igual', () => {
    const tied = group('A', [
      { id: 'a1', name: 'Los Pibes' },
      { id: 'a2', name: 'Atlético Fondo' },
    ])
    tied.rows[1]!.points = tied.rows[0]!.points
    tied.rows[1]!.unresolvedTie = true

    const corte = buildCorte({
      tournament: tournament(),
      stages: stages(1, 2),
      groups: [tied],
      teams: [team('a1', 'Los Pibes'), team('a2', 'Atlético Fondo')],
      matches: [match({ id: 'sf1', homeSourceSeed: 1, awaySourceSeed: 2 })],
    })!

    expect(corte.crosses).toHaveLength(1)
    expect(corte.crosses[0]!.homeTeamName).toBeNull()
    expect(corte.crosses[0]!.homeLabel).toBe('1º Zona A')
  })
})
