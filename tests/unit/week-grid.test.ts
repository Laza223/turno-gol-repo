import { describe, expect, it } from 'vitest'
import { buildWeekAxis, daySlotsOf, isSlotOpenOnDay, weekDays } from '@/lib/booking/week-grid'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

function hours(over: Partial<Record<keyof OpeningHours, OpeningHours[keyof OpeningHours]>> = {}) {
  const base = { open: '18:00', close: '23:00' }
  return {
    mon: base,
    tue: base,
    wed: base,
    thu: base,
    fri: base,
    sat: base,
    sun: base,
    ...over,
  } as OpeningHours
}

// 2026-11-10 es martes: la semana va del lunes 9 al domingo 15.
const DATE = '2026-11-10'

describe('weekDays', () => {
  it('va de lunes a domingo, sea cual sea el día que se pase', () => {
    const expected = [
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]
    expect(weekDays(DATE)).toEqual(expected)
    expect(weekDays('2026-11-09')).toEqual(expected)
    expect(weekDays('2026-11-15')).toEqual(expected)
  })
})

describe('buildWeekAxis', () => {
  it('con el mismo horario todos los días, las horas son las del complejo', () => {
    const axis = buildWeekAxis({
      date: DATE,
      openingHours: hours(),
      closedDates: [],
      closesNextDay: false,
    })
    expect(axis.slots).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00'])
    expect(axis.days).toHaveLength(7)
  })

  it('el eje es la unión de los días: el que abre más temprano y cierra más tarde manda', () => {
    const axis = buildWeekAxis({
      date: DATE,
      openingHours: hours({
        sat: { open: '10:00', close: '23:00' },
        mon: { open: '18:00', close: '00:00' },
      }),
      closedDates: [],
      closesNextDay: false,
    })
    expect(axis.slots[0]).toBe('10:00')
    expect(axis.slots.at(-1)).toBe('23:00')
    // el lunes cierra a medianoche: la hora de las 23:00 existe
    expect(isSlotOpenOnDay(axis, '2026-11-09', axis.slots.indexOf('23:00'))).toBe(true)
    // el martes abre a las 18: a las 10 no ofrece turno
    expect(isSlotOpenOnDay(axis, '2026-11-10', axis.slots.indexOf('10:00'))).toBe(false)
    // el sábado sí
    expect(isSlotOpenOnDay(axis, '2026-11-14', axis.slots.indexOf('10:00'))).toBe(true)
  })

  it('un día cerrado o una fecha cerrada no ofrece ninguna hora', () => {
    const axis = buildWeekAxis({
      date: DATE,
      openingHours: hours({ sun: { open: '18:00', close: '23:00', closed: true } }),
      closedDates: ['2026-11-11'],
      closesNextDay: false,
    })
    expect(axis.hours.get('2026-11-15')).toBeNull()
    expect(axis.hours.get('2026-11-11')).toBeNull()
    expect(daySlotsOf(axis, '2026-11-15')).toEqual([])
    expect(daySlotsOf(axis, '2026-11-11')).toEqual([])
    expect(daySlotsOf(axis, '2026-11-10')).toHaveLength(5)
  })

  it('si cierra pasada la medianoche, la madrugada queda al final del eje y envuelve', () => {
    const axis = buildWeekAxis({
      date: DATE,
      openingHours: hours({
        fri: { open: '20:00', close: '02:00' },
      }),
      closedDates: [],
      closesNextDay: true,
    })
    // el viernes llega hasta las 02:00 del sábado: 20,21,22,23,00,01
    expect(axis.slots.slice(-3)).toEqual(['23:00', '00:00', '01:00'])
    expect(daySlotsOf(axis, '2026-11-13')).toEqual([
      '20:00',
      '21:00',
      '22:00',
      '23:00',
      '00:00',
      '01:00',
    ])
  })

  it('sin ningún día abierto no hay filas', () => {
    const closed = { open: '18:00', close: '23:00', closed: true }
    const axis = buildWeekAxis({
      date: DATE,
      openingHours: hours({
        mon: closed,
        tue: closed,
        wed: closed,
        thu: closed,
        fri: closed,
        sat: closed,
        sun: closed,
      }),
      closedDates: [],
      closesNextDay: false,
    })
    expect(axis.slots).toEqual([])
  })
})
