import { describe, expect, it } from 'vitest'
import {
  buildBookingsIndex,
  computeCells,
  generateTimeSlots,
} from '@/lib/booking/grid-cells'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { CourtRow } from '@/modules/courts/court.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBooking(overrides: Partial<GridBooking> & Pick<GridBooking, 'courtId' | 'timeStart' | 'timeEnd'>): GridBooking {
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
    surfaceType: 'cesped',
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
})
