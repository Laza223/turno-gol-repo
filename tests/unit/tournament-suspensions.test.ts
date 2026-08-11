import { describe, expect, it } from 'vitest'
import { computeSuspensions } from '@/modules/tournaments/standings/suspensions'
import type { StandingsEvent, StandingsMatch } from '@/modules/tournaments/standings/types'

const CONFIG = { yellowCardsForSuspension: 3, redCardSuspensionMatches: 1 }

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
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: 1,
    awayScore: 0,
    homePenalties: null,
    awayPenalties: null,
    walkoverWinnerTeamId: null,
    ...over,
  }
}

/** Fecha `round` jugada entre A y B. */
function fecha(round: number, over: Partial<StandingsMatch> = {}): StandingsMatch {
  return match({ id: `f${round}`, round, ...over })
}

function card(
  id: string,
  matchId: string,
  type: 'yellow_card' | 'red_card',
  extra: Partial<StandingsEvent> = {},
): StandingsEvent {
  return {
    id,
    matchId,
    teamId: 'A',
    teamPlayerId: 'p1',
    type,
    suspensionMatches: null,
    ...extra,
  }
}

const rowOf = (rows: ReturnType<typeof computeSuspensions>, playerId: string) =>
  rows.find((r) => r.teamPlayerId === playerId)

describe('computeSuspensions — amarillas acumuladas', () => {
  it('la 3ra amarilla suspende una fecha', () => {
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2), fecha(3), fecha(4, { status: 'scheduled' })],
      events: [
        card('e1', 'f1', 'yellow_card'),
        card('e2', 'f2', 'yellow_card'),
        card('e3', 'f3', 'yellow_card'),
      ],
      config: CONFIG,
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.yellowCards).toBe(3)
    expect(p1.pendingMatches).toBe(1)
    expect(p1.reason).toBe('yellow_accumulation')
    expect(p1.triggerEventId).toBe('e3')
    expect(p1.suspendedMatchIds).toEqual(['f4'])
  })

  it('el contador arrastra el excedente: la 6ta amarilla vuelve a suspender', () => {
    const matches = [1, 2, 3, 4, 5, 6].map((r) => fecha(r))
    const events = [1, 2, 3, 4, 5, 6].map((r) => card(`e${r}`, `f${r}`, 'yellow_card'))
    const rows = computeSuspensions({ matches, events, config: CONFIG })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.yellowCards).toBe(6)
    // La 3ra amarilla suspende y se cumple en la fecha 4; la 6ta vuelve a
    // suspender pero cae en la última fecha, así que queda pendiente. Si el
    // excedente no se arrastrara, la 6ta no habría disparado nada.
    expect(p1.servedMatches).toBe(1)
    expect(p1.pendingMatches).toBe(1)
  })

  it('con el límite en 0 no suspende nunca', () => {
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2)],
      events: [card('e1', 'f1', 'yellow_card'), card('e2', 'f2', 'yellow_card')],
      config: { ...CONFIG, yellowCardsForSuspension: 0 },
    })
    expect(rowOf(rows, 'p1')!.pendingMatches).toBe(0)
  })
})

describe('computeSuspensions — rojas', () => {
  it('la roja suspende las fechas configuradas', () => {
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2, { status: 'scheduled' }), fecha(3, { status: 'scheduled' })],
      events: [card('e1', 'f1', 'red_card')],
      config: { ...CONFIG, redCardSuspensionMatches: 2 },
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.redCards).toBe(1)
    expect(p1.pendingMatches).toBe(2)
    expect(p1.reason).toBe('red_card')
    expect(p1.suspendedMatchIds).toEqual(['f2', 'f3'])
  })

  it('el override del tribunal manda sobre el default', () => {
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2, { status: 'scheduled' })],
      events: [card('e1', 'f1', 'red_card', { suspensionMatches: 4 })],
      config: CONFIG,
    })
    expect(rowOf(rows, 'p1')!.pendingMatches).toBe(4)
  })

  it('un indulto (0 fechas) no suspende pero la roja queda registrada', () => {
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2, { status: 'scheduled' })],
      events: [card('e1', 'f1', 'red_card', { suspensionMatches: 0 })],
      config: CONFIG,
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.redCards).toBe(1)
    expect(p1.pendingMatches).toBe(0)
    expect(p1.suspendedMatchIds).toEqual([])
  })

  it('NO se cumple la fecha en el partido en que lo expulsaron', () => {
    // Roja en la fecha 1: la fecha 1 no cuenta como cumplida, la 2 sí.
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2)],
      events: [card('e1', 'f1', 'red_card')],
      config: CONFIG,
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.servedMatches).toBe(1)
    expect(p1.pendingMatches).toBe(0)
  })
})

describe('computeSuspensions — amarilla del partido de la roja', () => {
  it('no acumula para la próxima, pero sí cuenta como tarjeta', () => {
    // 2 amarillas previas + amarilla y roja en el mismo partido. Sin la regla,
    // esa 3ra amarilla dispararía una segunda suspensión encima de la roja.
    const rows = computeSuspensions({
      matches: [fecha(1), fecha(2), fecha(3), fecha(4, { status: 'scheduled' })],
      events: [
        card('e1', 'f1', 'yellow_card'),
        card('e2', 'f2', 'yellow_card'),
        card('e3', 'f3', 'yellow_card'),
        card('e4', 'f3', 'red_card'),
      ],
      config: CONFIG,
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.yellowCards).toBe(3)
    expect(p1.redCards).toBe(1)
    // Solo la fecha de la roja, no la roja + la acumulación.
    expect(p1.pendingMatches).toBe(1)
    expect(p1.reason).toBe('red_card')
  })
})

describe('computeSuspensions — orden y proyección', () => {
  it('la suspensión cruza de la zona al playoff', () => {
    const rows = computeSuspensions({
      matches: [
        match({ id: 'z1', stageKind: 'group_stage', round: 1 }),
        match({
          id: 'p1',
          stageId: 'playoffs',
          stageOrderIndex: 1,
          stageKind: 'knockout',
          round: 1,
          status: 'scheduled',
        }),
      ],
      events: [card('e1', 'z1', 'red_card')],
      config: CONFIG,
    })
    expect(rowOf(rows, 'p1')!.suspendedMatchIds).toEqual(['p1'])
  })

  it('postponed y canceled no cumplen fecha ni se usan para proyectar', () => {
    const rows = computeSuspensions({
      matches: [
        fecha(1),
        fecha(2, { status: 'postponed' }),
        fecha(3, { status: 'canceled' }),
        fecha(4, { status: 'scheduled' }),
      ],
      events: [card('e1', 'f1', 'red_card')],
      config: CONFIG,
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.pendingMatches).toBe(1)
    expect(p1.suspendedMatchIds).toEqual(['f4'])
  })

  it('con el fixture sin agendar el orden sigue siendo determinista', () => {
    // Ningún startsAt y las fechas llegan desordenadas: el orden tiene que
    // salir de (stageOrderIndex, round, …) y no del orden del array.
    const matches = [fecha(3, { status: 'scheduled' }), fecha(1), fecha(2, { status: 'scheduled' })]
    const events = [card('e1', 'f1', 'red_card')]
    const a = computeSuspensions({ matches, events, config: CONFIG })
    const b = computeSuspensions({ matches, events, config: CONFIG })
    expect(a).toEqual(b)
    // La roja fue en la fecha 1, así que se pierde la 2, no la 3.
    expect(rowOf(a, 'p1')!.suspendedMatchIds).toEqual(['f2'])
  })

  it('un jugador con fechas pendientes y sin partidos restantes queda debiendo', () => {
    const rows = computeSuspensions({
      matches: [fecha(1)],
      events: [card('e1', 'f1', 'red_card', { suspensionMatches: 3 })],
      config: CONFIG,
    })
    const p1 = rowOf(rows, 'p1')!
    expect(p1.pendingMatches).toBe(3)
    expect(p1.suspendedMatchIds).toEqual([])
  })

  it('solo produce fila el jugador que tiene tarjetas', () => {
    const rows = computeSuspensions({
      matches: [fecha(1)],
      events: [card('e1', 'f1', 'yellow_card', { teamPlayerId: 'p9' })],
      config: CONFIG,
    })
    expect(rows.map((r) => r.teamPlayerId)).toEqual(['p9'])
  })
})
