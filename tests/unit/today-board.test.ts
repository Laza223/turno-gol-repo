import { describe, expect, it } from 'vitest'
import {
  boardRowKind,
  buildTodayBoard,
  hasEndedAt,
  startLabel,
  type BoardBooking,
  type BoardCourt,
} from '@/lib/dashboard/today-board'

/**
 * El tablero decide quién aparece sin cobrar. Un error acá no tira excepción:
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

const COURTS: BoardCourt[] = [
  { id: 'c1', name: 'Cancha 1', status: 'online' },
  { id: 'c2', name: 'Cancha 2', status: 'online' },
  { id: 'c3', name: 'Cancha 3', status: 'offline' },
]

describe('boardRowKind', () => {
  it('turno terminado con saldo: sin cobrar', () => {
    const b = booking({ start: '18:00', end: '19:00' })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBe('unpaid')
  })

  it('en el instante exacto en que termina, ya terminó', () => {
    const b = booking({ start: '18:00', end: '19:00' })
    expect(hasEndedAt(b, b.endsAtMs)).toBe(true)
    expect(hasEndedAt(b, b.endsAtMs - 1)).toBe(false)
    expect(boardRowKind(b, b.endsAtMs)).toBe('unpaid')
    expect(boardRowKind(b, b.endsAtMs - 1)).toBe('live')
  })

  it('un slot 23:00–24:00 termina a la medianoche, no antes ni "mañana a las 24:00"', () => {
    const b = booking({ start: '23:00', end: '24:00' })
    // 23:30: en juego. 00:30 del día siguiente: terminó hace media hora.
    expect(boardRowKind(b, ART(DAY, '23:30'))).toBe('live')
    expect(boardRowKind(b, ART('2026-09-20', '00:30'))).toBe('unpaid')
  })

  it('terminado y pagado no aparece', () => {
    const b = booking({ start: '18:00', end: '19:00', totalPaid: 6_000_000, pending: 0 })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBeNull()
  })

  it('un cobro parcial sigue figurando sin cobrar', () => {
    const b = booking({ start: '18:00', end: '19:00', totalPaid: 3_000_000, pending: 3_000_000 })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBe('unpaid')
  })

  it('completado con saldo es sin cobrar, aunque el reloj diga que no terminó', () => {
    const b = booking({ start: '18:00', end: '19:00', status: 'completed' })
    expect(boardRowKind(b, ART(DAY, '18:30'))).toBe('unpaid')
  })

  it('completado y saldado no aparece', () => {
    const b = booking({ start: '18:00', end: '19:00', status: 'completed', pending: 0 })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBeNull()
  })

  it('ausente y bloqueo no aparecen', () => {
    expect(
      boardRowKind(booking({ start: '18:00', end: '19:00', status: 'no_show' }), ART(DAY, '19:30')),
    ).toBeNull()
    expect(
      boardRowKind(booking({ start: '18:00', end: '19:00', type: 'block' }), ART(DAY, '18:30')),
    ).toBeNull()
  })

  it('una hora de torneo no se cobra por turno: nunca sin cobrar', () => {
    const b = booking({ start: '18:00', end: '19:00', type: 'tournament' })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBeNull()
    expect(boardRowKind(b, ART(DAY, '18:30'))).toBe('live')
  })

  it('en juego y por venir', () => {
    const b = booking({ start: '20:00', end: '21:00' })
    expect(boardRowKind(b, ART(DAY, '20:30'))).toBe('live')
    expect(boardRowKind(b, ART(DAY, '19:00'))).toBe('upcoming')
  })

  it('una seña sin pagar (pending_payment) por venir sigue en el tablero', () => {
    const b = booking({ start: '20:00', end: '21:00', status: 'pending_payment' })
    expect(boardRowKind(b, ART(DAY, '19:00'))).toBe('upcoming')
  })

  it('un pending_payment que ya pasó no es plata que falta cobrar', () => {
    const b = booking({ start: '18:00', end: '19:00', status: 'pending_payment' })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBeNull()
  })

  it('sin saldo conocido no se inventa una deuda', () => {
    const b = booking({ start: '18:00', end: '19:00', pending: null })
    expect(boardRowKind(b, ART(DAY, '19:30'))).toBeNull()
  })
})

describe('buildTodayBoard', () => {
  const now = ART(DAY, '21:30')

  it('una columna por cancha en el orden recibido; la pausada sin deuda no entra', () => {
    const cols = buildTodayBoard([], COURTS, now)
    expect(cols.map((c) => c.courtId)).toEqual(['c1', 'c2'])
  })

  it('una cancha pausada con un turno sin cobrar entra, marcada, con solo esa fila', () => {
    const cols = buildTodayBoard(
      [
        booking({ courtId: 'c3', start: '20:00', end: '21:00' }),
        booking({ courtId: 'c3', start: '22:00', end: '23:00' }),
      ],
      COURTS,
      now,
    )
    const c3 = cols.find((c) => c.courtId === 'c3')
    expect(c3?.offline).toBe(true)
    expect(c3?.rows.map((r) => r.kind)).toEqual(['unpaid'])
  })

  it('sin cobrar va arriba, aunque haya un turno en juego que empezó antes', () => {
    const cols = buildTodayBoard(
      [
        booking({ id: 'live', start: '20:00', end: '23:00', endsAtMs: ART(DAY, '23:00') }),
        booking({ id: 'unpaid', start: '20:30', end: '21:00' }),
      ],
      COURTS,
      now,
    )
    expect(cols[0]!.rows.map((r) => r.booking.id)).toEqual(['unpaid', 'live'])
  })

  it('00:00–01:00 va después de 23:00 (de la madrugada de esa noche)', () => {
    const late = ART(DAY, '22:30')
    const cols = buildTodayBoard(
      [
        booking({
          id: 'madrugada',
          start: '00:00',
          end: '01:00',
          startsAtMs: ART('2026-09-20', '00:00'),
          endsAtMs: ART('2026-09-20', '01:00'),
        }),
        booking({ id: 'noche', start: '23:00', end: '24:00' }),
      ],
      COURTS,
      late,
    )
    expect(cols[0]!.rows.map((r) => r.booking.id)).toEqual(['noche', 'madrugada'])
  })

  it('un turno de otra cancha que no existe se ignora', () => {
    const cols = buildTodayBoard(
      [booking({ courtId: 'fantasma', start: '20:00', end: '21:00' })],
      COURTS,
      now,
    )
    expect(cols.every((c) => c.rows.length === 0)).toBe(true)
  })

  it('no incluye pagados, ausentes ni bloqueos', () => {
    const cols = buildTodayBoard(
      [
        booking({ id: 'pagado', start: '18:00', end: '19:00', pending: 0, totalPaid: 6_000_000 }),
        booking({ id: 'ausente', start: '19:00', end: '20:00', status: 'no_show' }),
        booking({ id: 'bloqueo', start: '20:00', end: '21:00', type: 'block' }),
      ],
      COURTS,
      now,
    )
    expect(cols[0]!.rows).toEqual([])
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
