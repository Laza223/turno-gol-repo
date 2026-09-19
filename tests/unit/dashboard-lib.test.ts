import { describe, expect, it } from 'vitest'
import {
  daySlotsFor,
  occupancyForDay,
  rowDisplayName,
  slotHours,
  type DayBookingRow,
} from '@/lib/dashboard/day-bookings'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<DayBookingRow>): DayBookingRow {
  return {
    timeStart: '18:00',
    timeEnd: '19:00',
    type: 'spontaneous',
    ...overrides,
  }
}

type Named = Parameters<typeof rowDisplayName>[0]

function makeNamed(overrides: Partial<Named>): Named {
  return { guestName: null, playerFirstName: 'Tomás', playerLastName: 'García', ...overrides }
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
      makeRow({ timeStart: '18:00', timeEnd: '19:00' }),
      makeRow({ timeStart: '19:00', timeEnd: '21:00' }), // 120 min
      makeRow({ type: 'block', timeStart: '10:00', timeEnd: '12:00' }),
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
// rowDisplayName
// ---------------------------------------------------------------------------

describe('rowDisplayName', () => {
  it('guest primero, después jugador, después fallback', () => {
    expect(rowDisplayName(makeNamed({ guestName: 'Cacho' }))).toBe('Cacho')
    expect(rowDisplayName(makeNamed({}))).toBe('Tomás García')
    expect(rowDisplayName(makeNamed({ playerFirstName: null, playerLastName: null }))).toBe(
      'Sin nombre',
    )
  })
})
