import { describe, expect, it } from 'vitest'
import { rivalHourOptions } from '@/modules/rival/rival-hours'
import type { ScheduleSource } from '@/lib/schedule/open-status'
import { openingHours } from '@/test/fixtures/tenant'

// Semana de referencia: jue 2026-10-22 · vie 23 · sáb 24 · dom 25.
const day = (open: string, close: string, closed = false) => ({ open, close, closed })
const schedule = (over: Partial<ScheduleSource> = {}): ScheduleSource => ({
  openingHours: openingHours({
    thu: day('10:00', '23:00'),
    fri: day('10:00', '02:00'),
    sat: day('10:00', '00:00'),
    sun: day('10:00', '23:00', true),
  }),
  closedDates: [],
  closesNextDay: true,
  ...over,
})

const FAR = { today: '2026-10-20', nowTime: '12:00' } // el día consultado no es hoy
const opts = (date: string, over: Partial<Parameters<typeof rivalHourOptions>[0]> = {}) =>
  rivalHourOptions({ date, ...FAR, schedule: schedule(), ...over })

describe('rivalHourOptions', () => {
  it('sin horario cargado va la lista completa (48 medias horas) y las 4 rápidas', () => {
    const r = opts('2026-10-23', { schedule: null })
    expect(r.reason).toBe('ok')
    expect(r.all).toHaveLength(48)
    expect(r.all[0]).toBe('00:00')
    expect(r.all.at(-1)).toBe('23:30')
    expect(r.quick).toEqual(['19:00', '20:00', '21:00', '22:00'])
  })

  it('un día sin clave en el horario va completo, no se inventa uno', () => {
    const { thu: _omit, ...rest } = schedule().openingHours
    const r = opts('2026-10-22', {
      schedule: schedule({ openingHours: rest as ScheduleSource['openingHours'] }),
    })
    expect(r.reason).toBe('ok')
    expect(r.all).toHaveLength(48)
  })

  it('un día sin clave que figura en closedDates avisa que está cerrado', () => {
    const { fri: _omit, ...rest } = schedule().openingHours
    const r = opts('2026-10-23', {
      schedule: schedule({
        openingHours: rest as ScheduleSource['openingHours'],
        closedDates: ['2026-10-23'],
      }),
    })
    expect(r.reason).toBe('closed')
    expect(r.all).toHaveLength(48)
  })

  it('hoy descarta lo que ya pasó (solo lo posterior a la hora actual)', () => {
    const r = opts('2026-10-22', { today: '2026-10-22', nowTime: '20:10', schedule: null })
    expect(r.all[0]).toBe('20:30')
    expect(r.quick).toEqual(['21:00', '22:00'])
  })

  it('después de 23:30 hoy no queda ninguna: reason past', () => {
    const r = opts('2026-10-22', { today: '2026-10-22', nowTime: '23:45', schedule: null })
    expect(r).toEqual({ all: [], quick: [], reason: 'past' })
  })

  it('con el horario del complejo solo entran los turnos de 60 min enteros: cierre 23:00 → último 22:00', () => {
    const r = opts('2026-10-22')
    expect(r.reason).toBe('ok')
    expect(r.all[0]).toBe('10:00')
    expect(r.all.at(-1)).toBe('22:00')
    expect(r.all).not.toContain('22:30')
  })

  it('cierre a medianoche (00:00) → el último inicio es 23:00', () => {
    const r = opts('2026-10-24', { schedule: schedule({ closesNextDay: false }) })
    expect(r.all.at(-1)).toBe('23:00')
    expect(r.all).not.toContain('23:30')
  })

  it('cierre pasada la medianoche: el viernes llega hasta 23:00 y el sábado trae la madrugada 00:00-01:00', () => {
    const fri = opts('2026-10-23')
    expect(fri.all.at(-1)).toBe('23:00')
    expect(fri.all).not.toContain('00:00')
    const sat = opts('2026-10-24')
    expect(sat.all.slice(0, 3)).toEqual(['00:00', '00:30', '01:00'])
    expect(sat.all).not.toContain('01:30')
    expect(sat.all).not.toContain('09:30')
    expect(sat.all).toContain('10:00')
  })

  it('hoy, ya de madrugada, la cola del día operativo de ayer sigue disponible', () => {
    const r = opts('2026-10-24', { today: '2026-10-24', nowTime: '00:10' })
    expect(r.all).toEqual(expect.arrayContaining(['00:30', '01:00', '10:00']))
    expect(r.all).not.toContain('00:00')
  })

  it('día cerrado, feriado u horario mal cargado: lista completa y reason closed (se avisa, no se bloquea)', () => {
    const sunday = opts('2026-10-25')
    expect(sunday.reason).toBe('closed')
    expect(sunday.all).toHaveLength(48)

    const holiday = opts('2026-10-22', { schedule: schedule({ closedDates: ['2026-10-22'] }) })
    expect(holiday.reason).toBe('closed')

    // El default viejo: vie 10:00–01:00 sin closes_next_day no genera turnos.
    const broken = schedule({ closesNextDay: false })
    const r = opts('2026-10-23', {
      schedule: { ...broken, openingHours: { ...broken.openingHours, fri: day('10:00', '01:00') } },
    })
    expect(r.reason).toBe('closed')
    expect(r.all).toHaveLength(48)
  })

  it('día cerrado y además hoy: lista completa menos lo que pasó', () => {
    const r = opts('2026-10-25', { today: '2026-10-25', nowTime: '18:00' })
    expect(r.reason).toBe('closed')
    expect(r.all[0]).toBe('18:30')
  })

  it('cuando el complejo ya cerró por hoy no queda nada: reason past', () => {
    const r = opts('2026-10-22', { today: '2026-10-22', nowTime: '22:10' })
    expect(r).toEqual({ all: [], quick: [], reason: 'past' })
  })

  it('la hora precargada (reserva o repetición) sigue seleccionable aunque caiga fuera del horario', () => {
    expect(opts('2026-10-22').all).not.toContain('22:30')
    expect(opts('2026-10-22', { keep: '22:30' }).all).toContain('22:30')
    // pero no vuelve lo que ya pasó
    const r = opts('2026-10-22', { today: '2026-10-22', nowTime: '20:00', keep: '09:00' })
    expect(r.all).not.toContain('09:00')
  })

  it('las rápidas son solo las que existen ese día', () => {
    expect(opts('2026-10-22').quick).toEqual(['19:00', '20:00', '21:00', '22:00'])
    const late = opts('2026-10-22', { today: '2026-10-22', nowTime: '20:00', schedule: null })
    expect(late.quick).toEqual(['21:00', '22:00'])
  })
})
