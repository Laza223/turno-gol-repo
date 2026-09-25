import { describe, expect, it } from 'vitest'
import {
  buildChargeQueue,
  buildCourtBoard,
  hasEndedAt,
  startLabel,
  type BoardBooking,
} from '@/lib/dashboard/today-board'

/**
 * La cola de Hoy decide a quién hay que cobrarle ahora. Un error acá no tira excepción:
 * o esconde plata que falta, o le muestra al mostrador una fila que no existe.
 * Todos los horarios se dan en UTC: ART es UTC-3, así 20:00 ART = 23:00Z.
 */

const ART = (day: string, hhmm: string): number => {
  // day 'YYYY-MM-DD', hhmm 'HH:MM' en hora de Argentina (UTC-3, sin DST).
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${day}T00:00:00Z`) + ((h ?? 0) + 3) * 3_600_000 + (m ?? 0) * 60_000
}

const DAY = '2026-09-19'

function booking(over: Partial<BoardBooking> & { start: string; end: string }): BoardBooking {
  const { start, end, ...rest } = over
  return {
    id: `b-${start}-${rest.courtId ?? 'c1'}`,
    courtId: 'c1',
    date: DAY,
    timeStart: start,
    timeEnd: end,
    startsAtMs: ART(DAY, start),
    endsAtMs: end === '24:00' ? ART(DAY, '24:00') : ART(DAY, end),
    status: 'confirmed',
    type: 'spontaneous',
    guestName: 'Juan',
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 6_000_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 6_000_000,
    ...rest,
  } as BoardBooking
}

/** Solo el orden importa: es el de la Grilla. `c3` es una cancha pausada. */
const COURTS = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]

describe('buildChargeQueue', () => {
  const ids = (list: { booking: BoardBooking }[]) => list.map((i) => i.booking.id)

  it('turno terminado con saldo: a cobrar ahora, como terminado', () => {
    const b = booking({ id: 'b', start: '18:00', end: '19:00' })
    const q = buildChargeQueue([b], COURTS, ART(DAY, '19:30'))
    expect(q.now).toEqual([{ booking: b, ended: true }])
    expect(q.upcoming).toEqual([])
  })

  it('en el instante exacto en que termina, ya terminó', () => {
    const b = booking({ start: '18:00', end: '19:00' })
    expect(hasEndedAt(b, b.endsAtMs)).toBe(true)
    expect(hasEndedAt(b, b.endsAtMs - 1)).toBe(false)
    expect(buildChargeQueue([b], COURTS, b.endsAtMs).now[0]?.ended).toBe(true)
    expect(buildChargeQueue([b], COURTS, b.endsAtMs - 1).now[0]?.ended).toBe(false)
  })

  it('cuando llega la hora, el turno ya está para cobrar aunque se esté jugando', () => {
    const b = booking({ start: '20:00', end: '21:00' })
    expect(buildChargeQueue([b], COURTS, ART(DAY, '19:59')).now).toEqual([])
    expect(buildChargeQueue([b], COURTS, ART(DAY, '20:00')).now).toEqual([
      { booking: b, ended: false },
    ])
  })

  it('en juego y ya pagado no se cobra ni figura entre los próximos', () => {
    const b = booking({ start: '20:00', end: '21:00', totalPaid: 6_000_000, pending: 0 })
    const q = buildChargeQueue([b], COURTS, ART(DAY, '20:30'))
    expect(q.now).toEqual([])
    expect(q.upcoming).toEqual([])
  })

  it('un slot 23:00–24:00 termina a la medianoche, no antes ni "mañana a las 24:00"', () => {
    const b = booking({ start: '23:00', end: '24:00' })
    expect(buildChargeQueue([b], COURTS, ART(DAY, '23:30')).now[0]?.ended).toBe(false)
    expect(buildChargeQueue([b], COURTS, ART('2026-09-20', '00:30')).now[0]?.ended).toBe(true)
  })

  it('terminado y pagado no aparece', () => {
    const b = booking({ start: '18:00', end: '19:00', totalPaid: 6_000_000, pending: 0 })
    expect(buildChargeQueue([b], COURTS, ART(DAY, '19:30')).now).toEqual([])
  })

  it('a medias (pagó un equipo) sigue para cobrar hasta que paga el otro', () => {
    const b = booking({ start: '18:00', end: '19:00', totalPaid: 3_000_000, pending: 3_000_000 })
    expect(ids(buildChargeQueue([b], COURTS, ART(DAY, '19:30')).now)).toEqual([b.id])
  })

  it('completado con saldo es terminado, aunque el reloj diga que no terminó', () => {
    const b = booking({ start: '18:00', end: '19:00', status: 'completed' })
    expect(buildChargeQueue([b], COURTS, ART(DAY, '18:30')).now).toEqual([
      { booking: b, ended: true },
    ])
  })

  it('ausente y bloqueo no aparecen en ningún lado', () => {
    const q = buildChargeQueue(
      [
        booking({ id: 'ausente', start: '18:00', end: '19:00', status: 'no_show' }),
        booking({ id: 'bloqueo', start: '18:00', end: '19:00', type: 'block' }),
        booking({ id: 'bloqueo-luego', start: '22:00', end: '23:00', type: 'block' }),
      ],
      COURTS,
      ART(DAY, '19:30'),
    )
    expect(q.now).toEqual([])
    expect(q.upcoming).toEqual([])
  })

  it('una hora de torneo no se cobra por turno, pero figura entre los próximos', () => {
    const jugado = booking({ id: 'jugado', start: '18:00', end: '19:00', type: 'tournament' })
    const luego = booking({ id: 'luego', start: '21:00', end: '22:00', type: 'tournament' })
    const q = buildChargeQueue([jugado, luego], COURTS, ART(DAY, '19:30'))
    expect(q.now).toEqual([])
    expect(q.upcoming.map((b) => b.id)).toEqual(['luego'])
  })

  it('una seña sin pagar no es plata del mostrador; si todavía no empezó, es un próximo', () => {
    const empezado = booking({ id: 'e', start: '18:00', end: '19:00', status: 'pending_payment' })
    const luego = booking({ id: 'l', start: '21:00', end: '22:00', status: 'pending_payment' })
    const q = buildChargeQueue([empezado, luego], COURTS, ART(DAY, '18:30'))
    expect(q.now).toEqual([])
    expect(q.upcoming.map((b) => b.id)).toEqual(['l'])
  })

  it('sin saldo conocido no se inventa plata para cobrar', () => {
    const b = booking({ start: '18:00', end: '19:00', pending: null })
    expect(buildChargeQueue([b], COURTS, ART(DAY, '19:30')).now).toEqual([])
  })

  it('una cancha pausada o que ya no existe no esconde un turno jugado sin cobrar', () => {
    const q = buildChargeQueue(
      [
        booking({ id: 'fantasma', courtId: 'borrada', start: '18:00', end: '19:00' }),
        booking({ id: 'pausada', courtId: 'c3', start: '18:00', end: '19:00' }),
      ],
      COURTS,
      ART(DAY, '19:30'),
    )
    expect(ids(q.now)).toEqual(['pausada', 'fantasma'])
  })

  it('orden: los que terminaron, el más reciente arriba; después los que se juegan; por cancha', () => {
    const q = buildChargeQueue(
      [
        booking({ id: 'viejo', courtId: 'c1', start: '18:00', end: '19:00' }),
        booking({ id: 'vivo-c2', courtId: 'c2', start: '21:00', end: '22:00' }),
        booking({ id: 'recien-c2', courtId: 'c2', start: '20:00', end: '21:00' }),
        booking({ id: 'vivo-c1', courtId: 'c1', start: '21:00', end: '22:00' }),
        booking({ id: 'recien-c1', courtId: 'c1', start: '20:00', end: '21:00' }),
      ],
      COURTS,
      ART(DAY, '21:05'),
    )
    expect(ids(q.now)).toEqual(['recien-c1', 'recien-c2', 'viejo', 'vivo-c1', 'vivo-c2'])
    expect(q.now.map((i) => i.ended)).toEqual([true, true, true, false, false])
  })

  it('próximos: por hora y después por cancha; la madrugada va después de las 23', () => {
    const q = buildChargeQueue(
      [
        booking({
          id: 'madrugada',
          start: '00:00',
          end: '01:00',
          startsAtMs: ART('2026-09-20', '00:00'),
          endsAtMs: ART('2026-09-20', '01:00'),
        }),
        booking({ id: 'noche-c2', courtId: 'c2', start: '23:00', end: '24:00' }),
        booking({ id: 'noche-c1', courtId: 'c1', start: '23:00', end: '24:00' }),
      ],
      COURTS,
      ART(DAY, '22:30'),
    )
    expect(q.upcoming.map((b) => b.id)).toEqual(['noche-c1', 'noche-c2', 'madrugada'])
  })

  it('anyStarted: distingue "todo cobrado" de "todavía no se jugó nada"', () => {
    const pagado = booking({ start: '18:00', end: '19:00', totalPaid: 6_000_000, pending: 0 })
    expect(buildChargeQueue([pagado], COURTS, ART(DAY, '17:00')).anyStarted).toBe(false)
    expect(buildChargeQueue([pagado], COURTS, ART(DAY, '18:00')).anyStarted).toBe(true)
    const bloqueo = booking({ start: '18:00', end: '19:00', type: 'block' })
    expect(buildChargeQueue([bloqueo], COURTS, ART(DAY, '19:30')).anyStarted).toBe(false)
  })
})

describe('startLabel', () => {
  const b = booking({ start: '20:00', end: '21:00' })

  it('en juego dice ahora', () => {
    expect(startLabel(b, ART(DAY, '20:10'))).toBe('ahora')
  })

  it('dentro de la hora dice en N min, redondeando para arriba', () => {
    expect(startLabel(b, ART(DAY, '19:35'))).toBe('en 25 min')
    expect(startLabel(b, ART(DAY, '19:59') + 30_000)).toBe('en 1 min')
  })

  it('más lejos no dice nada', () => {
    expect(startLabel(b, ART(DAY, '18:00'))).toBeNull()
  })

  it('un turno terminado no tiene etiqueta de inicio', () => {
    expect(startLabel(b, ART(DAY, '21:30'))).toBeNull()
  })
})

describe('buildCourtBoard', () => {
  const BOARD_COURTS = [
    { id: 'c1', status: 'online' as const },
    { id: 'c2', status: 'online' as const },
    { id: 'c3', status: 'offline' as const },
  ]
  const focus = (board: ReturnType<typeof buildCourtBoard>) =>
    board.tiles.map((t) => [
      t.courtId,
      t.focus?.kind ?? null,
      t.focus?.booking.id ?? null,
      t.moreDue,
    ])

  it('una tarjeta por cancha en servicio: lo terminado sin cobrar le gana a lo que se juega y a lo que viene', () => {
    const ended = booking({ id: 'ended', start: '18:00', end: '19:00' })
    const live = booking({ id: 'live', start: '19:00', end: '20:00' })
    const next = booking({ id: 'next', start: '20:00', end: '21:00' })
    const live2 = booking({
      id: 'live2',
      courtId: 'c2',
      start: '19:00',
      end: '20:00',
      pending: 0,
      totalPaid: 6_000_000,
    })
    const next2 = booking({ id: 'next2', courtId: 'c2', start: '21:00', end: '22:00' })
    const board = buildCourtBoard(
      [ended, live, next, live2, next2],
      BOARD_COURTS,
      ART(DAY, '19:30'),
    )
    // c1: el terminado, y el que se juega (debe) cuenta como uno más para cobrar.
    // c2: el que se juega aunque esté pagado. c3 pausada y sin nada: no aparece.
    expect(focus(board)).toEqual([
      ['c1', 'due', 'ended', 1],
      ['c2', 'live', 'live2', 0],
    ])
    expect(board.lateCount).toBe(1)
    expect(board.lateCents).toBe(6_000_000)
  })

  it('sin nada jugándose muestra el próximo, y nada si no le queda ninguno', () => {
    const next = booking({ id: 'next', courtId: 'c2', start: '21:00', end: '22:00' })
    const paid = booking({
      id: 'paid',
      start: '18:00',
      end: '19:00',
      status: 'completed',
      pending: 0,
      totalPaid: 6_000_000,
    })
    const board = buildCourtBoard([next, paid], BOARD_COURTS, ART(DAY, '19:30'))
    expect(focus(board)).toEqual([
      ['c1', null, null, 0],
      ['c2', 'next', 'next', 0],
    ])
    expect(board.lateCount).toBe(0)
  })

  it('una cancha pausada con un turno sin cobrar aparece igual: esa plata no se esconde', () => {
    const b = booking({ id: 'off', courtId: 'c3', start: '18:00', end: '19:00' })
    const board = buildCourtBoard([b], BOARD_COURTS, ART(DAY, '19:30'))
    expect(focus(board)).toEqual([
      ['c1', null, null, 0],
      ['c2', null, null, 0],
      ['c3', 'due', 'off', 0],
    ])
  })

  it('el terminado más reciente va adelante y los demás se cuentan', () => {
    const a = booking({ id: 'a', start: '17:00', end: '18:00' })
    const b = booking({ id: 'b', start: '18:00', end: '19:00' })
    const board = buildCourtBoard([a, b], BOARD_COURTS, ART(DAY, '19:30'))
    expect(board.tiles[0]).toMatchObject({
      focus: { kind: 'due', booking: { id: 'b' } },
      moreDue: 1,
    })
    expect(board.lateCount).toBe(2)
  })

  it('un bloqueo no se muestra como el turno de la cancha', () => {
    const block = booking({ id: 'blk', start: '19:00', end: '20:00', type: 'block', pending: null })
    const next = booking({ id: 'next', start: '20:00', end: '21:00' })
    const board = buildCourtBoard([block, next], BOARD_COURTS, ART(DAY, '19:30'))
    expect(board.tiles[0]?.focus).toMatchObject({ kind: 'next', booking: { id: 'next' } })
  })
})
