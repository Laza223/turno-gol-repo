import { describe, expect, it } from 'vitest'
import {
  buildBookingsIndex,
  computeCells,
  countCollapsibleLeading,
  generateTimeSlots,
  hasBookingEnded,
  isPendingCollection,
  sumPendingCents,
} from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBooking(
  overrides: Partial<GridBooking> & Pick<GridBooking, 'courtId' | 'timeStart' | 'timeEnd'>,
): GridBooking {
  return {
    id: 'b1',
    date: '2025-06-01',
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Tomás',
    playerLastName: 'García',
    priceSnapshot: 500000,
    ...overrides,
  }
}

function makeCourt(id: string): CourtRow {
  return {
    id,
    tenantId: 'tenant1',
    name: `Cancha ${id}`,
    description: null,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    hasLighting: true,
    format: 5,
    capacity: 10,
    photos: [],
    status: 'online',
    pricing: { rules: [] },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  }
}

const courts = [makeCourt('court1')]

// ---------------------------------------------------------------------------
// Test 1: 1 booking 60 min → rowSpan=1
// ---------------------------------------------------------------------------

describe('computeCells', () => {
  it('T1: 1 booking 60min → rowSpan=1, kind=booking', () => {
    const booking = makeBooking({ courtId: 'court1', timeStart: '10:00:00', timeEnd: '11:00:00' })
    const slots = generateTimeSlots('10:00', '12:00')
    const index = buildBookingsIndex([booking])
    const cells = computeCells(slots, courts, index)

    const cell = cells.get('court1:10:00')
    expect(cell).toBeDefined()
    expect(cell?.kind).toBe('booking')
    if (cell?.kind === 'booking') {
      expect(cell.rowSpan).toBe(1)
      expect(cell.booking.id).toBe('b1')
    }
  })

  // -------------------------------------------------------------------------
  // Test 2: 1 booking 120min → rowSpan=2, next slot is 'skip'
  // -------------------------------------------------------------------------

  it('T2: 1 booking 120min → rowSpan=2, slot 11:00 = skip', () => {
    const booking = makeBooking({ courtId: 'court1', timeStart: '10:00:00', timeEnd: '12:00:00' })
    const slots = generateTimeSlots('10:00', '13:00')
    const index = buildBookingsIndex([booking])
    const cells = computeCells(slots, courts, index)

    const cell10 = cells.get('court1:10:00')
    expect(cell10?.kind).toBe('booking')
    if (cell10?.kind === 'booking') {
      expect(cell10.rowSpan).toBe(2)
    }

    const cell11 = cells.get('court1:11:00')
    expect(cell11?.kind).toBe('skip')

    // 12:00 is beyond the 2-slot span → free
    const cell12 = cells.get('court1:12:00')
    expect(cell12?.kind).toBe('free')
  })

  // -------------------------------------------------------------------------
  // Test 3: canceled_refunded and regular type with non-blocking status → free
  // -------------------------------------------------------------------------

  it('T3: canceled_refunded booking → cell stays free', () => {
    const booking = makeBooking({
      courtId: 'court1',
      timeStart: '10:00:00',
      timeEnd: '11:00:00',
      status: 'canceled_refunded',
    })
    const slots = generateTimeSlots('10:00', '11:00')
    const index = buildBookingsIndex([booking])
    const cells = computeCells(slots, courts, index)

    const cell = cells.get('court1:10:00')
    expect(cell?.kind).toBe('free')
  })

  it('T3b: type=regular (spontaneous) with expired status → cell stays free', () => {
    const booking = makeBooking({
      courtId: 'court1',
      timeStart: '10:00:00',
      timeEnd: '11:00:00',
      type: 'spontaneous',
      status: 'expired',
    })
    const slots = generateTimeSlots('10:00', '11:00')
    const index = buildBookingsIndex([booking])
    const cells = computeCells(slots, courts, index)

    const cell = cells.get('court1:10:00')
    expect(cell?.kind).toBe('free')
  })

  // -------------------------------------------------------------------------
  // Test 4: buildBookingsIndex strips seconds from timeStart
  // -------------------------------------------------------------------------

  it('T4: buildBookingsIndex keys by courtId:HH:MM (strips seconds)', () => {
    const booking = makeBooking({ courtId: 'court1', timeStart: '10:00:00', timeEnd: '11:00:00' })
    const index = buildBookingsIndex([booking])

    // Key must use HH:MM only
    expect(index.has('court1:10:00')).toBe(true)
    // Full ISO-style key must NOT exist
    expect(index.has('court1:10:00:00')).toBe(false)
    expect(index.get('court1:10:00')).toBe(booking)
  })

  // -------------------------------------------------------------------------
  // Test 5: buildBookingsIndex preserves first-wins semantics for duplicate keys
  // -------------------------------------------------------------------------

  it('T5: buildBookingsIndex first-wins — duplicate courtId:timeStart keeps the first booking', () => {
    const first = makeBooking({
      id: 'first',
      courtId: 'court1',
      timeStart: '10:00:00',
      timeEnd: '11:00:00',
    })
    const second = makeBooking({
      id: 'second',
      courtId: 'court1',
      timeStart: '10:00:00',
      timeEnd: '11:00:00',
    })
    const index = buildBookingsIndex([first, second])

    expect(index.get('court1:10:00')?.id).toBe('first')
  })
})

// ---------------------------------------------------------------------------
// countCollapsibleLeading — banda "Sin actividad" (pages/grilla.md §5)
// ---------------------------------------------------------------------------

describe('countCollapsibleLeading', () => {
  /** isPast estilo grilla: pasado = slot estrictamente anterior a `now`. */
  const pastBefore = (now: string) => (slot: string) => slot < now

  function cellsFor(slots: string[], bookings: GridBooking[]) {
    return computeCells(slots, courts, buildBookingsIndex(bookings))
  }

  it('colapsa la corrida inicial pasada y libre, dejando visible el slot en curso', () => {
    // now 15:30 → 08..15 pasados; 15:00 está transcurriendo → queda visible.
    const slots = generateTimeSlots('08:00', '23:00')
    const cells = cellsFor(slots, [])
    expect(countCollapsibleLeading(slots, courts, cells, pastBefore('15:30'))).toBe(7)
  })

  it('una reserva pasada corta el colapso (lo jugado/ausente queda visible)', () => {
    const slots = generateTimeSlots('08:00', '23:00')
    const cells = cellsFor(slots, [
      makeBooking({
        courtId: 'court1',
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        status: 'completed',
      }),
    ])
    // Solo 08:00 y 09:00 son colapsables: 10:00 tiene una Jugada.
    expect(countCollapsibleLeading(slots, courts, cells, pastBefore('15:30'))).toBe(2)
  })

  it('menos de 2 filas colapsables → no colapsa', () => {
    const slots = generateTimeSlots('08:00', '23:00')
    const cells = cellsFor(slots, [])
    // now 09:30: 08:00 pasado, 09:00 en curso → colapsable = 1 → 0.
    expect(countCollapsibleLeading(slots, courts, cells, pastBefore('09:30'))).toBe(0)
  })

  it('día futuro (nada pasado) → 0', () => {
    const slots = generateTimeSlots('08:00', '23:00')
    const cells = cellsFor(slots, [])
    expect(countCollapsibleLeading(slots, courts, cells, () => false)).toBe(0)
  })

  it('día entero pasado y vacío → nunca colapsa todas las filas', () => {
    const slots = generateTimeSlots('08:00', '23:00')
    const cells = cellsFor(slots, [])
    expect(countCollapsibleLeading(slots, courts, cells, () => true)).toBe(slots.length - 1)
  })
})

// ---------------------------------------------------------------------------
// hasBookingEnded — instante físico, con fallback al status
// ---------------------------------------------------------------------------

describe('hasBookingEnded', () => {
  const NOW = Date.parse('2026-03-14T18:30:00.000Z')
  const base = { courtId: 'court1', timeStart: '10:00:00', timeEnd: '11:00:00' } as const

  it('con endsAtMs: manda el instante físico, no el status', () => {
    expect(hasBookingEnded(makeBooking({ ...base, endsAtMs: NOW - 1000 }), NOW)).toBe(true)
    expect(hasBookingEnded(makeBooking({ ...base, endsAtMs: NOW + 1000 }), NOW)).toBe(false)
  })

  it('sin endsAtMs (Realtime crudo, fixtures viejas): degrada al status', () => {
    expect(hasBookingEnded(makeBooking({ ...base, status: 'completed' }), NOW)).toBe(true)
    expect(hasBookingEnded(makeBooking({ ...base, status: 'confirmed' }), NOW)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sumPendingCents — "¿qué falta cobrar hoy?" (encabezado de la grilla)
// ---------------------------------------------------------------------------

describe('sumPendingCents', () => {
  const NOW = Date.parse('2026-03-14T18:30:00.000Z')

  // El bug que esto corrige (2026-09-25): un `confirmed` que TODAVÍA no se
  // jugó sumaba igual que uno terminado, así que el chip "N sin cobrar"
  // contaba turnos que ni se habían jugado.
  it('NO suma un confirmed que todavía no terminó, aunque tenga saldo', () => {
    const bookings = [
      makeBooking({
        courtId: 'court1',
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        pending: 200000,
        endsAtMs: NOW + 60_000,
      }),
    ]
    expect(sumPendingCents(bookings, NOW)).toEqual({ totalCents: 0, count: 0 })
    expect(isPendingCollection(bookings[0]!, NOW)).toBe(false)
  })

  it('suma un confirmed que ya terminó y un completed con saldo pendiente', () => {
    const bookings = [
      makeBooking({
        courtId: 'court1',
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        pending: 200000,
        endsAtMs: NOW - 60_000,
      }),
      makeBooking({
        courtId: 'court1',
        timeStart: '11:00:00',
        timeEnd: '12:00:00',
        status: 'completed',
        pending: 300000,
      }),
    ]
    expect(sumPendingCents(bookings, NOW)).toEqual({ totalCents: 500000, count: 2 })
  })

  it('no_show con saldo NO suma: un no-show no es deuda', () => {
    const bookings = [
      makeBooking({
        courtId: 'court1',
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        status: 'no_show',
        pending: 200000,
      }),
    ]
    expect(sumPendingCents(bookings, NOW)).toEqual({ totalCents: 0, count: 0 })
  })

  it('pending_payment (hold de 6 min) NO suma', () => {
    const bookings = [
      makeBooking({
        courtId: 'court1',
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        status: 'pending_payment',
        pending: 200000,
      }),
    ]
    expect(sumPendingCents(bookings, NOW)).toEqual({ totalCents: 0, count: 0 })
  })

  it('pending null o cero se ignora, no se cuenta como cero', () => {
    const bookings = [
      makeBooking({ courtId: 'court1', timeStart: '10:00:00', timeEnd: '11:00:00', pending: null }),
      makeBooking({ courtId: 'court1', timeStart: '11:00:00', timeEnd: '12:00:00', pending: 0 }),
    ]
    expect(sumPendingCents(bookings, NOW)).toEqual({ totalCents: 0, count: 0 })
  })

  // Rediseño 2026-09-14: un `block` nunca carga plata — aunque un dato viejo
  // o corrupto le pegara un `pending` positivo, no cuenta como "por cobrar".
  // `endsAtMs` en el pasado a propósito: ni terminado cuenta un bloqueo.
  it('un block con pending > 0 NO suma: un bloqueo no es el turno de nadie', () => {
    const bookings = [
      makeBooking({
        courtId: 'court1',
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        type: 'block',
        pending: 200000,
        endsAtMs: NOW - 60_000,
      }),
    ]
    expect(sumPendingCents(bookings, NOW)).toEqual({ totalCents: 0, count: 0 })
    expect(isPendingCollection(bookings[0]!, NOW)).toBe(false)
  })
})
