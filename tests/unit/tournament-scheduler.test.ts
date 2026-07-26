import { describe, expect, it } from 'vitest'
import {
  scheduleMatches,
  slotCapacity,
  type OwnedSlot,
  type SchedulableMatch,
} from '@/modules/tournaments/fixture/scheduler'

/** Una hora poseída por el torneo, arrancando a las `hour` UTC del 2027-03-06. */
function slot(bookingId: string, courtId: string, hour: number, day = 6): OwnedSlot {
  const d = (h: number) => new Date(Date.UTC(2027, 2, day, h, 0, 0))
  return { bookingId, courtId, startsAt: d(hour), endsAt: d(hour + 1) }
}

function match(ref: string, round: number, home: string, away: string): SchedulableMatch {
  return { ref, round, homeTeamId: home, awayTeamId: away }
}

const HOUR_MATCH = { matchDurationMinutes: 60 }

describe('scheduleMatches — partidos de una hora', () => {
  it('mete un partido por hora y cancha', () => {
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c1', 15)]
    const matches = [match('m1', 1, 'A', 'B'), match('m2', 2, 'C', 'D')]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)

    expect(unscheduled).toHaveLength(0)
    expect(scheduled).toHaveLength(2)
    expect(scheduled[0]!.bookingId).toBe('b1')
    expect(scheduled[1]!.bookingId).toBe('b2')
  })

  it('usa las canchas en paralelo para partidos de la misma fecha', () => {
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c2', 14)]
    const matches = [match('m1', 1, 'A', 'B'), match('m2', 1, 'C', 'D')]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)

    expect(unscheduled).toHaveLength(0)
    expect(scheduled.map((s) => s.startsAt.toISOString())).toEqual([
      scheduled[0]!.startsAt.toISOString(),
      scheduled[0]!.startsAt.toISOString(),
    ])
    expect(new Set(scheduled.map((s) => s.courtId)).size).toBe(2)
  })

  it('reporta los que no entran en vez de agendar a medias', () => {
    const slots = [slot('b1', 'c1', 14)]
    const matches = [match('m1', 1, 'A', 'B'), match('m2', 1, 'C', 'D')]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)

    expect(scheduled).toHaveLength(1)
    expect(unscheduled.map((m) => m.ref)).toEqual(['m2'])
  })

  it('sin horas tomadas no agenda nada y lo dice', () => {
    const { scheduled, unscheduled } = scheduleMatches(
      [match('m1', 1, 'A', 'B')],
      [],
      HOUR_MATCH,
    )
    expect(scheduled).toHaveLength(0)
    expect(unscheduled).toHaveLength(1)
  })
})

describe('scheduleMatches — un equipo no juega dos veces a la vez', () => {
  it('no lo pone en dos canchas en el mismo horario', () => {
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c2', 14), slot('b3', 'c1', 15)]
    // A juega los dos partidos de la fecha: no pueden ser simultáneos.
    const matches = [match('m1', 1, 'A', 'B'), match('m2', 1, 'A', 'C')]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)

    expect(unscheduled).toHaveLength(0)
    const [first, second] = scheduled
    expect(first!.startsAt.getTime()).not.toBe(second!.startsAt.getTime())
  })

  it('con varios partidos por equipo nunca hay solapamiento', () => {
    const slots = Array.from({ length: 12 }, (_, i) =>
      slot(`b${i}`, i % 2 === 0 ? 'c1' : 'c2', 14 + Math.floor(i / 2)),
    )
    const matches = [
      match('m1', 1, 'A', 'B'),
      match('m2', 1, 'C', 'D'),
      match('m3', 2, 'A', 'C'),
      match('m4', 2, 'B', 'D'),
      match('m5', 3, 'A', 'D'),
      match('m6', 3, 'B', 'C'),
    ]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)
    expect(unscheduled).toHaveLength(0)

    const byTeam = new Map<string, Array<[number, number]>>()
    for (const s of scheduled) {
      const m = matches.find((x) => x.ref === s.ref)!
      for (const t of [m.homeTeamId!, m.awayTeamId!]) {
        const list = byTeam.get(t) ?? []
        list.push([s.startsAt.getTime(), s.endsAt.getTime()])
        byTeam.set(t, list)
      }
    }
    for (const spans of byTeam.values()) {
      spans.sort((a, b) => a[0] - b[0])
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1])
      }
    }
  })
})

describe('scheduleMatches — orden de rondas', () => {
  it('una ronda no arranca antes de que termine la anterior', () => {
    // Obligatorio en llaves: el ganador de la ronda 1 juega la ronda 2.
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c2', 14), slot('b3', 'c1', 15)]
    const matches = [
      match('m1', 1, 'A', 'B'),
      match('m2', 1, 'C', 'D'),
      { ref: 'm3', round: 2, homeTeamId: null, awayTeamId: null },
    ]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)

    expect(unscheduled).toHaveLength(0)
    const r1End = Math.max(
      ...scheduled.filter((s) => s.ref !== 'm3').map((s) => s.endsAt.getTime()),
    )
    const final = scheduled.find((s) => s.ref === 'm3')!
    expect(final.startsAt.getTime()).toBeGreaterThanOrEqual(r1End)
  })

  it('si no queda hora después de la ronda anterior, la siguiente no entra', () => {
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c2', 14)]
    const matches = [
      match('m1', 1, 'A', 'B'),
      match('m2', 1, 'C', 'D'),
      { ref: 'm3', round: 2, homeTeamId: null, awayTeamId: null },
    ]

    const { unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)
    expect(unscheduled.map((m) => m.ref)).toEqual(['m3'])
  })
})

describe('scheduleMatches — fases', () => {
  it('una fase no arranca hasta que termina la anterior, aunque compartan el número de ronda', () => {
    // El caso real: la fecha 1 de la zona y la ronda 1 de los playoffs son las
    // dos `round = 1`. Sin stageOrder el scheduler las mezclaría y la
    // semifinal podría quedar ANTES de que se jueguen las zonas — y como los
    // partidos de playoffs nacen sin equipos, la restricción de equipos
    // tampoco lo frena.
    // TRES canchas a las 14 y una a las 15, a propósito: si el scheduler
    // ignorara stageOrder, la semi entraría en la tercera cancha a las 14 —
    // o sea, EN PARALELO con las zonas — y este test se pondría rojo. Con dos
    // canchas el bug pasaría desapercibido porque la semi caería en la de las
    // 15 igual, por falta de lugar y no por la regla.
    const slots = [
      slot('b1', 'c1', 14),
      slot('b2', 'c2', 14),
      slot('b3', 'c3', 14),
      slot('b4', 'c1', 15),
    ]
    const matches: SchedulableMatch[] = [
      { ref: 'zona-1', stageOrder: 0, round: 1, homeTeamId: 'A', awayTeamId: 'B' },
      { ref: 'zona-2', stageOrder: 0, round: 1, homeTeamId: 'C', awayTeamId: 'D' },
      // Playoff: misma ronda que la zona, pero fase posterior y sin equipos.
      { ref: 'semi', stageOrder: 1, round: 1, homeTeamId: null, awayTeamId: null },
    ]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)

    expect(unscheduled).toHaveLength(0)
    const zonaEnd = Math.max(
      ...scheduled.filter((s) => s.ref.startsWith('zona')).map((s) => s.endsAt.getTime()),
    )
    const semi = scheduled.find((s) => s.ref === 'semi')!
    expect(semi.startsAt.getTime()).toBeGreaterThanOrEqual(zonaEnd)
  })

  it('sin stageOrder se comporta como antes (todo es fase 0)', () => {
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c1', 15)]
    const matches = [match('m1', 1, 'A', 'B'), match('m2', 2, 'A', 'C')]
    const { scheduled, unscheduled } = scheduleMatches(matches, slots, HOUR_MATCH)
    expect(unscheduled).toHaveLength(0)
    expect(scheduled).toHaveLength(2)
  })

  it('respeta el orden de fases aunque lleguen desordenadas', () => {
    const slots = [slot('b1', 'c1', 14), slot('b2', 'c1', 15)]
    const matches: SchedulableMatch[] = [
      { ref: 'final', stageOrder: 1, round: 1, homeTeamId: null, awayTeamId: null },
      { ref: 'zona', stageOrder: 0, round: 1, homeTeamId: 'A', awayTeamId: 'B' },
    ]
    const { scheduled } = scheduleMatches(matches, slots, HOUR_MATCH)
    const zona = scheduled.find((s) => s.ref === 'zona')!
    const final = scheduled.find((s) => s.ref === 'final')!
    expect(final.startsAt.getTime()).toBeGreaterThanOrEqual(zona.endsAt.getTime())
  })
})

describe('scheduleMatches — relámpago (partidos cortos)', () => {
  it('mete dos partidos de 25 min en una hora', () => {
    const slots = [slot('b1', 'c1', 14)]
    const matches = [match('m1', 1, 'A', 'B'), match('m2', 1, 'C', 'D')]

    const { scheduled, unscheduled } = scheduleMatches(matches, slots, {
      matchDurationMinutes: 25,
      restBetweenMatchesMinutes: 5,
    })

    expect(unscheduled).toHaveLength(0)
    expect(scheduled).toHaveLength(2)
    expect(scheduled.every((s) => s.bookingId === 'b1')).toBe(true)
    // 14:00 y 14:30 — el recambio de 5 min va incluido en el paso.
    expect(scheduled[0]!.startsAt.toISOString()).toContain('T14:00')
    expect(scheduled[1]!.startsAt.toISOString()).toContain('T14:30')
  })

  it('el recambio no deja meter un partido que no termina dentro de la hora', () => {
    // 25+5+25+5+25 = 85 > 60: entran 2, no 3.
    expect(
      slotCapacity([slot('b1', 'c1', 14)], {
        matchDurationMinutes: 25,
        restBetweenMatchesMinutes: 5,
      }),
    ).toBe(2)
  })

  it('sin recambio entran 3 de 20 minutos', () => {
    expect(slotCapacity([slot('b1', 'c1', 14)], { matchDurationMinutes: 20 })).toBe(3)
  })

  it('un partido más largo que la hora no entra en ningún lado', () => {
    const { scheduled, unscheduled } = scheduleMatches(
      [match('m1', 1, 'A', 'B')],
      [slot('b1', 'c1', 14)],
      { matchDurationMinutes: 90 },
    )
    expect(scheduled).toHaveLength(0)
    expect(unscheduled).toHaveLength(1)
  })
})

describe('scheduleMatches — determinismo', () => {
  it('dos corridas con la misma entrada dan el mismo reparto', () => {
    const slots = [slot('b2', 'c2', 14), slot('b1', 'c1', 14), slot('b3', 'c1', 15)]
    const matches = [
      match('m1', 1, 'A', 'B'),
      match('m2', 1, 'C', 'D'),
      match('m3', 2, 'A', 'C'),
    ]
    const a = scheduleMatches(matches, slots, HOUR_MATCH)
    const b = scheduleMatches(matches, slots, HOUR_MATCH)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
