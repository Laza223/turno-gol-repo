import { describe, expect, it } from 'vitest'
import { computeCells, generateTimeSlots, type GridBooking } from '@/lib/booking/grid-cells'
import { isDraggableBooking, resolveDropTarget, slotRange } from '@/lib/booking/grid-drag'
import type { CourtRow } from '@/modules/courts/court.types'

function makeCourt(id: string, status: 'online' | 'offline' = 'online'): CourtRow {
  return {
    id,
    tenantId: 't1',
    name: `Cancha ${id}`,
    description: null,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    hasLighting: true,
    format: 5,
    capacity: 10,
    photos: [],
    status,
    pricing: { rules: [] },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  }
}

function makeBooking(courtId: string, timeStart: string, timeEnd: string): GridBooking {
  return {
    id: `b-${courtId}-${timeStart}`,
    courtId,
    date: '2026-11-10',
    timeStart,
    timeEnd,
    status: 'confirmed',
    type: 'spontaneous',
    guestName: 'Pedro',
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 3000000,
  }
}

describe('slotRange', () => {
  it('devuelve el turno de 60 min del slot', () => {
    const slots = generateTimeSlots('18:00', '23:00')
    expect(slotRange(slots, '19:00')).toEqual({ timeStart: '19:00', timeEnd: '20:00' })
  })

  it('la última hora antes de medianoche termina en 24:00', () => {
    const slots = generateTimeSlots('18:00', '00:00')
    expect(slotRange(slots, '23:00')).toEqual({ timeStart: '23:00', timeEnd: '24:00' })
  })

  it('las madrugadas de un complejo que cierra pasada la medianoche envuelven', () => {
    const slots = generateTimeSlots('20:00', '02:00', true)
    expect(slotRange(slots, '23:00')).toEqual({ timeStart: '23:00', timeEnd: '24:00' })
    expect(slotRange(slots, '00:00')).toEqual({ timeStart: '00:00', timeEnd: '01:00' })
    expect(slotRange(slots, '01:00')).toEqual({ timeStart: '01:00', timeEnd: '02:00' })
  })

  it('un slot que no existe en el día da null', () => {
    expect(slotRange(['18:00', '19:00'], '07:00')).toBeNull()
  })
})

describe('resolveDropTarget', () => {
  const slots = generateTimeSlots('18:00', '22:00')
  const courts = [makeCourt('a'), makeCourt('b'), makeCourt('c', 'offline')]
  const cells = computeCells(
    slots,
    courts,
    new Map([['a:19:00', makeBooking('a', '19:00', '20:00')]]),
  )
  const ctx = (past: string[] = []) => ({
    courts,
    visibleSlots: slots,
    cells,
    isSlotPast: (s: string) => past.includes(s),
  })

  it('un hueco libre y futuro de una cancha online es válido', () => {
    expect(resolveDropTarget({ col: 1, row: 2 }, ctx())).toMatchObject({
      courtId: 'b',
      slotTime: '20:00',
      courtIndex: 1,
      row: 2,
      valid: true,
    })
  })

  it('un hueco ocupado no es válido', () => {
    expect(resolveDropTarget({ col: 0, row: 1 }, ctx())?.valid).toBe(false)
  })

  it('un hueco pasado no es válido', () => {
    expect(resolveDropTarget({ col: 1, row: 0 }, ctx(['18:00']))?.valid).toBe(false)
  })

  it('una cancha pausada no es válida', () => {
    expect(resolveDropTarget({ col: 2, row: 2 }, ctx())?.valid).toBe(false)
  })

  it('fuera de la grilla da null', () => {
    expect(resolveDropTarget({ col: 9, row: 0 }, ctx())).toBeNull()
    expect(resolveDropTarget({ col: 0, row: 9 }, ctx())).toBeNull()
  })

  it('un evento de varias horas bloquea todas sus filas', () => {
    const long = computeCells(
      slots,
      courts,
      new Map([['a:18:00', makeBooking('a', '18:00', '20:00')]]),
    )
    const target = resolveDropTarget(
      { col: 0, row: 1 },
      { courts, visibleSlots: slots, cells: long, isSlotPast: () => false },
    )
    expect(target?.valid).toBe(false)
  })
})

describe('isDraggableBooking', () => {
  const base = { canReschedule: true, started: false }
  it('se agarra si se puede reprogramar y no empezó', () => {
    expect(isDraggableBooking({ depositStatus: null }, base)).toBe(true)
  })
  it('no si el gate de reprogramar no lo permite', () => {
    expect(isDraggableBooking({}, { ...base, canReschedule: false })).toBe(false)
  })
  it('no si ya empezó', () => {
    expect(isDraggableBooking({}, { ...base, started: true })).toBe(false)
  })
  it('no con una seña en curso', () => {
    expect(isDraggableBooking({ depositStatus: 'pending' }, base)).toBe(false)
  })
})
