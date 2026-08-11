import { describe, expect, it } from 'vitest'
import {
  countFreeOpenings,
  openingsForMatch,
  type PlacementMatch,
} from '@/modules/tournaments/fixture/placement'
import { openingsIn } from '@/modules/tournaments/fixture/scheduler'

/**
 * Los huecos que la Planilla le ofrece al encargado para mover un partido.
 *
 * Lo que se prueba acá es que la afordancia coincida con las tres reglas que
 * `rescheduleMatch` valida en la transacción (hora poseída, equipo sin dos
 * partidos pisados, cancha sin dos partidos encima). Si divergen, el tablero
 * ofrece destinos que el servidor rechaza — que es exactamente el problema que
 * este módulo existe para evitar.
 */

const DAY = { year: 2027, month: 2, day: 6 } // 6 de marzo de 2027

function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(DAY.year, DAY.month, DAY.day, hour, minute, 0))
}

/** Una hora entera que el torneo posee. */
function slot(bookingId: string, courtId: string, hour: number) {
  return { bookingId, courtId, startsAt: at(hour), endsAt: at(hour + 1), date: '2027-03-06' }
}

function match(
  id: string,
  teams: [string, string],
  placed: { courtId: string; hour: number; minute?: number; durationMin: number } | null,
): PlacementMatch {
  const [home, away] = teams
  return {
    id,
    courtId: placed?.courtId ?? null,
    startsAt: placed ? at(placed.hour, placed.minute ?? 0) : null,
    endsAt: placed
      ? new Date(at(placed.hour, placed.minute ?? 0).getTime() + placed.durationMin * 60_000)
      : null,
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: `Equipo ${home}`,
    awayTeamName: `Equipo ${away}`,
  }
}

const HOUR_MATCH = { matchDurationMinutes: 60 }
const RELAMPAGO = { matchDurationMinutes: 25, restBetweenMatchesMinutes: 5 }

describe('openingsIn — los huecos salen del mismo cálculo que el generador', () => {
  it('un partido de 60 min entra una sola vez en una hora', () => {
    expect(openingsIn(slot('b1', 'c1', 20), HOUR_MATCH)).toHaveLength(1)
  })

  it('un relámpago de 25 min + 5 de recambio entra dos veces', () => {
    const openings = openingsIn(slot('b1', 'c1', 20), RELAMPAGO)

    expect(openings).toHaveLength(2)
    expect(openings.map((o) => o.start.toISOString())).toEqual([
      at(20, 0).toISOString(),
      at(20, 30).toISOString(),
    ])
    // El tercero arrancaría 21:00 y terminaría 21:25: se pasa de la hora.
    expect(openings[1]!.end.toISOString()).toBe(at(20, 55).toISOString())
  })

  it('una hora que no alcanza para el partido completo no da ningún hueco', () => {
    // 90 minutos de partido dentro de una reserva de 60.
    expect(openingsIn(slot('b1', 'c1', 20), { matchDurationMinutes: 90 })).toHaveLength(0)
  })
})

describe('openingsForMatch — tablero en reposo (sin partido moviéndose)', () => {
  const slots = [slot('b1', 'c1', 20), slot('b2', 'c2', 20), slot('b3', 'c1', 21)]

  it('devuelve un hueco por hora poseída y marca cuáles tienen partido', () => {
    const jugado = match('m1', ['A', 'B'], { courtId: 'c1', hour: 20, durationMin: 60 })

    const openings = openingsForMatch({
      slots,
      matches: [jugado],
      movingMatchId: null,
      options: HOUR_MATCH,
    })

    expect(openings).toHaveLength(3)
    expect(openings.map((o) => o.status)).toEqual(['occupied', 'free', 'free'])
    expect(openings[0]!.occupiedBy?.id).toBe('m1')
    expect(openings[0]!.reason).toBe('Acá juega Equipo A vs Equipo B.')
  })

  it('sin partido moviéndose nunca hay `current` ni `team_busy`', () => {
    const openings = openingsForMatch({
      slots,
      matches: [match('m1', ['A', 'B'], { courtId: 'c1', hour: 20, durationMin: 60 })],
      movingMatchId: null,
      options: HOUR_MATCH,
    })

    expect(openings.some((o) => o.status === 'current')).toBe(false)
    expect(openings.some((o) => o.status === 'team_busy')).toBe(false)
  })

  it('ordena cronológicamente y después por cancha', () => {
    const openings = openingsForMatch({
      slots: [slot('b3', 'c2', 21), slot('b1', 'c2', 20), slot('b2', 'c1', 20)],
      matches: [],
      movingMatchId: null,
      options: HOUR_MATCH,
    })

    expect(openings.map((o) => `${o.startsAt.getUTCHours()}/${o.slot.courtId}`)).toEqual([
      '20/c1',
      '20/c2',
      '21/c2',
    ])
  })
})

describe('openingsForMatch — moviendo un partido', () => {
  const slots = [
    slot('b1', 'c1', 20),
    slot('b2', 'c2', 20),
    slot('b3', 'c1', 21),
    slot('b4', 'c2', 21),
  ]

  it('marca `current` el hueco donde el partido ya está, y no lo cuenta ocupado', () => {
    const moving = match('m1', ['A', 'B'], { courtId: 'c1', hour: 20, durationMin: 60 })

    const openings = openingsForMatch({
      slots,
      matches: [moving],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    const here = openings.find((o) => o.slot.bookingId === 'b1')!
    expect(here.status).toBe('current')
    expect(here.occupiedBy?.id).toBe('m1')
    expect(countFreeOpenings(openings)).toBe(3)
  })

  it('la cancha ocupada por OTRO partido no es destino', () => {
    const moving = match('m1', ['A', 'B'], null)
    const otro = match('m2', ['C', 'D'], { courtId: 'c1', hour: 21, durationMin: 60 })

    const openings = openingsForMatch({
      slots,
      matches: [moving, otro],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    const tomado = openings.find((o) => o.slot.bookingId === 'b3')!
    expect(tomado.status).toBe('occupied')
    expect(tomado.reason).toBe('Acá juega Equipo C vs Equipo D.')
  })

  it('un equipo ocupado en OTRA cancha a la misma hora bloquea el hueco', () => {
    const moving = match('m1', ['A', 'B'], null)
    // A juega en la cancha 2 a las 20: el hueco de las 20 en la cancha 1 está
    // libre de cancha, pero A no puede estar en los dos lados.
    const otro = match('m2', ['A', 'C'], { courtId: 'c2', hour: 20, durationMin: 60 })

    const openings = openingsForMatch({
      slots,
      matches: [moving, otro],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    const bloqueado = openings.find((o) => o.slot.bookingId === 'b1')!
    expect(bloqueado.status).toBe('team_busy')
    expect(bloqueado.reason).toBe('Equipo A ya tiene otro partido a esa hora.')

    // A las 21 el mismo equipo está libre.
    expect(openings.find((o) => o.slot.bookingId === 'b3')!.status).toBe('free')
  })

  it('la cancha ocupada gana sobre el equipo ocupado: el motivo es el de la cancha', () => {
    const moving = match('m1', ['A', 'B'], null)
    // Los dos conflictos caen sobre el MISMO hueco (c1 a las 20).
    const otro = match('m2', ['A', 'C'], { courtId: 'c1', hour: 20, durationMin: 60 })

    const openings = openingsForMatch({
      slots,
      matches: [moving, otro],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    expect(openings.find((o) => o.slot.bookingId === 'b1')!.status).toBe('occupied')
  })

  it('una llave sin equipos definidos no choca con nadie', () => {
    const moving: PlacementMatch = {
      id: 'm1',
      courtId: null,
      startsAt: null,
      endsAt: null,
      homeTeamId: null,
      awayTeamId: null,
      homeTeamName: null,
      awayTeamName: null,
    }
    const otro = match('m2', ['A', 'C'], { courtId: 'c2', hour: 20, durationMin: 60 })

    const openings = openingsForMatch({
      slots,
      matches: [moving, otro],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    // Solo el hueco físicamente ocupado queda afuera; los otros tres son destino.
    expect(countFreeOpenings(openings)).toBe(3)
  })

  it('mover dentro de la misma hora no choca contra sí mismo', () => {
    // Relámpago: el partido está en el primer hueco de la hora y se lo quiere
    // correr al segundo. Sin excluirlo de los conflictos, su propio horario
    // haría ilegal el hueco de al lado por solapamiento de equipo.
    const moving = match('m1', ['A', 'B'], {
      courtId: 'c1',
      hour: 20,
      durationMin: 25,
    })

    const openings = openingsForMatch({
      slots: [slot('b1', 'c1', 20)],
      matches: [moving],
      movingMatchId: 'm1',
      options: RELAMPAGO,
    })

    expect(openings).toHaveLength(2)
    expect(openings[0]!.status).toBe('current')
    expect(openings[1]!.status).toBe('free')
  })

  it('un partido sin hora no ocupa nada', () => {
    const openings = openingsForMatch({
      slots,
      matches: [match('m1', ['A', 'B'], null), match('m2', ['C', 'D'], null)],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    expect(countFreeOpenings(openings)).toBe(4)
  })

  it('un partido corrido a mano que pisa dos huecos bloquea los dos', () => {
    // 20:30–21:30 en la cancha 1: no arranca en ningún hueco del paso, pero
    // pisa el de las 20 y el de las 21. Por eso el choque se mide por
    // solapamiento y no por igualdad de arranque.
    const moving = match('m1', ['A', 'B'], null)
    const corrido = match('m2', ['C', 'D'], {
      courtId: 'c1',
      hour: 20,
      minute: 30,
      durationMin: 60,
    })

    const openings = openingsForMatch({
      slots,
      matches: [moving, corrido],
      movingMatchId: 'm1',
      options: HOUR_MATCH,
    })

    const enCancha1 = openings.filter((o) => o.slot.courtId === 'c1')
    expect(enCancha1.map((o) => o.status)).toEqual(['occupied', 'occupied'])
  })

  it('un movingMatchId que ya no existe se comporta como tablero en reposo', () => {
    const openings = openingsForMatch({
      slots,
      matches: [match('m2', ['C', 'D'], { courtId: 'c1', hour: 20, durationMin: 60 })],
      movingMatchId: 'borrado',
      options: HOUR_MATCH,
    })

    expect(openings.some((o) => o.status === 'current')).toBe(false)
    expect(countFreeOpenings(openings)).toBe(3)
  })
})
