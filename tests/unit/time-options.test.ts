import { describe, expect, it } from 'vitest'
import {
  durationHours,
  endTimeOptions,
  freeStartTimes,
  maxEndTime,
  weekdayOf,
  WEEKDAY_NAMES_ES,
} from '@/components/booking/create-modal/time-options'
import { generateTimeSlots } from '@/lib/booking/grid-cells'
import type { OccupancyBooking } from '@/components/booking/create-modal/time-options'

function bk(over: Partial<OccupancyBooking>): OccupancyBooking {
  return { timeStart: '10:00', timeEnd: '11:00', status: 'confirmed', type: 'spontaneous', ...over }
}

describe('freeStartTimes', () => {
  const slots = generateTimeSlots('08:00', '23:00')

  it('excluye pasados y ocupados', () => {
    const out = freeStartTimes({
      slots,
      courtBookings: [bk({ timeStart: '10:00', timeEnd: '11:00' })],
      isPast: (t) => t < '09:00',
    })
    expect(out).not.toContain('08:00')
    expect(out).not.toContain('10:00')
    expect(out).toContain('09:00')
    expect(out).toContain('11:00')
  })

  it('un no_show con seña capturada sigue ocupando el slot (no libera la grilla)', () => {
    const out = freeStartTimes({
      slots,
      courtBookings: [bk({ timeStart: '12:00', timeEnd: '13:00', status: 'no_show' })],
      isPast: () => false,
    })
    expect(out).not.toContain('12:00')
  })

  it('una reserva cancelada NO ocupa (no está en el criterio de la grilla)', () => {
    const out = freeStartTimes({
      slots,
      courtBookings: [bk({ timeStart: '12:00', timeEnd: '13:00', status: 'canceled_refunded' })],
      isPast: () => false,
    })
    expect(out).toContain('12:00')
  })
})

describe('maxEndTime', () => {
  const slots = generateTimeSlots('08:00', '23:00')

  it('sin reservas después, topea en el cierre del día', () => {
    expect(maxEndTime({ slots, startTime: '21:00', courtBookings: [] })).toBe('23:00')
  })

  it('topea en la próxima reserva de la cancha', () => {
    const out = maxEndTime({
      slots,
      startTime: '16:00',
      courtBookings: [bk({ timeStart: '19:00', timeEnd: '20:00' })],
    })
    expect(out).toBe('19:00')
  })

  it('un bloqueo también topea, aunque su `type` no sea spontaneous', () => {
    const out = maxEndTime({
      slots,
      startTime: '16:00',
      courtBookings: [
        bk({ timeStart: '18:00', timeEnd: '19:00', status: 'confirmed', type: 'block' }),
      ],
    })
    expect(out).toBe('18:00')
  })

  it('el slot 23:00 de un cierre post-medianoche tapa en 24:00, nunca cruza', () => {
    const nextDaySlots = generateTimeSlots('08:00', '02:00', true)
    expect(maxEndTime({ slots: nextDaySlots, startTime: '23:00', courtBookings: [] })).toBe('24:00')
  })

  it('un arranque post-medianoche (00:00) sigue viendo el cierre real (02:00)', () => {
    const nextDaySlots = generateTimeSlots('08:00', '02:00', true)
    expect(maxEndTime({ slots: nextDaySlots, startTime: '00:00', courtBookings: [] })).toBe('02:00')
  })
})

describe('endTimeOptions', () => {
  const slots = generateTimeSlots('08:00', '23:00')

  it('una opción por cada hora entera hasta el tope', () => {
    const out = endTimeOptions({
      slots,
      startTime: '20:00',
      courtBookings: [bk({ timeStart: '23:00', timeEnd: '24:00' })],
    })
    expect(out).toEqual(['21:00', '22:00', '23:00'])
  })

  it('el slot de las 23:00 con cierre post-medianoche ofrece una sola opción, 24:00', () => {
    const nextDaySlots = generateTimeSlots('08:00', '02:00', true)
    expect(endTimeOptions({ slots: nextDaySlots, startTime: '23:00', courtBookings: [] })).toEqual([
      '24:00',
    ])
  })
})

describe('durationHours', () => {
  it('calcula horas enteras', () => {
    expect(durationHours('20:00', '23:00')).toBe(3)
  })

  it('entiende "24:00" como medianoche', () => {
    expect(durationHours('22:00', '24:00')).toBe(2)
  })
})

describe('weekdayOf / WEEKDAY_NAMES_ES', () => {
  it('domingo es 0', () => {
    // 2026-03-15 es domingo.
    expect(weekdayOf('2026-03-15')).toBe(0)
    expect(WEEKDAY_NAMES_ES[weekdayOf('2026-03-15')]).toBe('domingo')
  })

  it('lunes es 1', () => {
    expect(weekdayOf('2026-03-16')).toBe(1)
    expect(WEEKDAY_NAMES_ES[weekdayOf('2026-03-16')]).toBe('lunes')
  })
})
