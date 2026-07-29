import { describe, expect, it } from 'vitest'
import {
  badgeKindForRow,
  daySlotsFor,
  occupancyForDay,
  pendingDeposits,
  playedCount,
  relativeStartLabel,
  rowDisplayName,
  slotHours,
  upcomingForDay,
  type DayBookingRow,
} from '@/lib/dashboard/day-bookings'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<DayBookingRow>): DayBookingRow {
  return {
    id: 'b1',
    courtName: 'Cancha 1',
    timeStart: '18:00',
    timeEnd: '19:00',
    status: 'confirmed',
    type: 'spontaneous',
    depositStatus: 'not_required',
    depositAmount: 0,
    guestName: null,
    playerFirstName: 'Tomás',
    playerLastName: 'García',
    priceSnapshot: 2500000,
    ...overrides,
  }
}

const HOURS: OpeningHours = {
  mon: { open: '08:00', close: '23:00' },
  tue: { open: '08:00', close: '23:00' },
  wed: { open: '08:00', close: '23:00' },
  thu: { open: '08:00', close: '23:00' },
  fri: { open: '08:00', close: '23:00' },
  sat: { open: '08:00', close: '23:00' },
  sun: { open: '08:00', close: '23:00', closed: true },
}

// ---------------------------------------------------------------------------
// slotHours
// ---------------------------------------------------------------------------

describe('slotHours', () => {
  it('rango normal de 60 min → 1', () => {
    expect(slotHours('18:00', '19:00')).toBe(1)
  })

  it("'24:00' como fin (slot de medianoche) → 1", () => {
    expect(slotHours('23:00', '24:00')).toBe(1)
  })

  it('rango que cruza medianoche (23:00→01:00) → 2', () => {
    expect(slotHours('23:00', '01:00')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// daySlotsFor
// ---------------------------------------------------------------------------

describe('daySlotsFor', () => {
  // 2026-07-01 = miércoles, 2026-07-05 = domingo.
  it('día abierto → slots de 60 min entre open y close', () => {
    const slots = daySlotsFor('2026-07-01', HOURS, [], false)
    expect(slots[0]).toBe('08:00')
    expect(slots).toHaveLength(15) // 08..22
  })

  it('closed_dates pisa el horario → []', () => {
    expect(daySlotsFor('2026-07-01', HOURS, ['2026-07-01'], false)).toEqual([])
  })

  it('día marcado closed → []', () => {
    expect(daySlotsFor('2026-07-05', HOURS, [], false)).toEqual([])
  })

  it('día operativo: close 02:00 con closesNextDay agrega la madrugada', () => {
    const hours = { ...HOURS, wed: { open: '08:00', close: '02:00' } }
    const slots = daySlotsFor('2026-07-01', hours, [], true)
    expect(slots).toHaveLength(18) // 08..23 + 00 + 01
    expect(slots.at(-1)).toBe('01:00')
  })

  it('close <= open SIN el flag → rango inválido, []', () => {
    const hours = { ...HOURS, wed: { open: '08:00', close: '02:00' } }
    expect(daySlotsFor('2026-07-01', hours, [], false)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// occupancyForDay
// ---------------------------------------------------------------------------

describe('occupancyForDay', () => {
  it('reservas suman horas ocupadas; bloqueos restan oferta', () => {
    const rows = [
      makeRow({ id: 'a', timeStart: '18:00', timeEnd: '19:00' }),
      makeRow({ id: 'b', timeStart: '19:00', timeEnd: '21:00' }), // 120 min
      makeRow({ id: 'c', type: 'block', timeStart: '10:00', timeEnd: '12:00' }),
    ]
    // 15 slots × 2 canchas = 30 − 2 bloqueadas = 28 disponibles; 3 ocupadas.
    const occ = occupancyForDay(rows, 15, 2)
    expect(occ).toEqual({ occupied: 3, available: 28, blocked: 2, pct: 11 })
  })

  it('sin oferta (0 canchas online) → pct 0, sin división por cero', () => {
    const occ = occupancyForDay([makeRow({})], 15, 0)
    expect(occ.available).toBe(0)
    expect(occ.pct).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// upcomingForDay
// ---------------------------------------------------------------------------

describe('upcomingForDay', () => {
  it('filtra jugadas/bloqueos y lo ya terminado; incluye el turno en curso', () => {
    const rows = [
      makeRow({ id: 'past', timeStart: '10:00', timeEnd: '11:00' }),
      makeRow({ id: 'played', timeStart: '11:00', timeEnd: '12:00', status: 'completed' }),
      makeRow({ id: 'current', timeStart: '15:00', timeEnd: '16:00' }),
      makeRow({ id: 'later', timeStart: '18:00', timeEnd: '19:00', status: 'pending_payment' }),
      makeRow({ id: 'block', type: 'block', timeStart: '20:00', timeEnd: '21:00' }),
    ]
    const ids = upcomingForDay(rows, '15:30', '08:00', false).map((r) => r.id)
    expect(ids).toEqual(['current', 'later'])
  })

  it('madrugada operativa ordena al final (01:00 después de 23:00)', () => {
    const rows = [
      makeRow({ id: 'late-night', timeStart: '01:00', timeEnd: '02:00' }),
      makeRow({ id: 'night', timeStart: '23:00', timeEnd: '24:00' }),
    ]
    const ids = upcomingForDay(rows, '22:00', '08:00', true).map((r) => r.id)
    expect(ids).toEqual(['night', 'late-night'])
  })

  it("sin closesNextDay no normaliza: '24:00' igual compara bien", () => {
    const rows = [makeRow({ id: 'night', timeStart: '23:00', timeEnd: '24:00' })]
    expect(upcomingForDay(rows, '23:30', '08:00', false).map((r) => r.id)).toEqual(['night'])
  })
})

// ---------------------------------------------------------------------------
// relativeStartLabel
// ---------------------------------------------------------------------------

describe('relativeStartLabel', () => {
  it("en curso → 'ahora'", () => {
    expect(relativeStartLabel({ timeStart: '15:00', timeEnd: '16:00' }, '15:30', '08:00', false)).toBe('ahora')
  })

  it("arranca dentro de la hora → 'en X min'", () => {
    expect(relativeStartLabel({ timeStart: '16:00', timeEnd: '17:00' }, '15:20', '08:00', false)).toBe('en 40 min')
  })

  it('más de 60 min → null (alcanza la hora absoluta)', () => {
    expect(relativeStartLabel({ timeStart: '18:00', timeEnd: '19:00' }, '15:30', '08:00', false)).toBeNull()
  })

  it('madrugada operativa: 00:30 con apertura 08:00 y flag → en 30 min desde las 24:00', () => {
    expect(relativeStartLabel({ timeStart: '00:30', timeEnd: '01:30' }, '24:00', '08:00', true)).toBe('en 30 min')
  })
})

// ---------------------------------------------------------------------------
// pendingDeposits / playedCount / rowDisplayName / badgeKindForRow
// ---------------------------------------------------------------------------

describe('pendingDeposits', () => {
  it('suma solo pending_payment (sin bloqueos)', () => {
    const rows = [
      makeRow({ id: 'a', status: 'pending_payment', depositAmount: 500000 }),
      makeRow({ id: 'b', status: 'pending_payment', depositAmount: 750000 }),
      makeRow({ id: 'c', status: 'confirmed', depositAmount: 500000 }),
      makeRow({ id: 'd', type: 'block', status: 'pending_payment', depositAmount: 100 }),
    ]
    expect(pendingDeposits(rows)).toEqual({ count: 2, amountCents: 1250000 })
  })
})

describe('playedCount', () => {
  it('cuenta solo completed no-block', () => {
    const rows = [
      makeRow({ id: 'a', status: 'completed' }),
      makeRow({ id: 'b', status: 'no_show' }),
      makeRow({ id: 'c', type: 'block', status: 'completed' }),
    ]
    expect(playedCount(rows)).toBe(1)
  })
})

describe('rowDisplayName', () => {
  it('guest primero, después jugador, después fallback', () => {
    expect(rowDisplayName(makeRow({ guestName: 'Cacho' }))).toBe('Cacho')
    expect(rowDisplayName(makeRow({}))).toBe('Tomás García')
    expect(
      rowDisplayName(makeRow({ playerFirstName: null, playerLastName: null })),
    ).toBe('Sin nombre')
  })
})

describe('badgeKindForRow', () => {
  it('prioridad: esperando > señada > abonado > confirmada (pages/grilla.md §2)', () => {
    expect(badgeKindForRow(makeRow({ status: 'pending_payment', depositStatus: 'pending' }))).toBe('esperando')
    expect(badgeKindForRow(makeRow({ depositStatus: 'paid', type: 'fixed' }))).toBe('senada')
    expect(badgeKindForRow(makeRow({ depositStatus: 'captured' }))).toBe('senada')
    expect(badgeKindForRow(makeRow({ type: 'fixed' }))).toBe('abonado')
    expect(badgeKindForRow(makeRow({}))).toBe('confirmada')
  })
})
