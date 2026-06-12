import { describe, expect, it } from 'vitest'
import {
  pickFreeSlotPills,
  type CourtOccupancy,
} from '@/modules/tenants/availability-search.service'

const free = (courtId: string): CourtOccupancy => ({ courtId, busy: [] })

describe('pickFreeSlotPills', () => {
  it('asigna la primera cancha libre a cada horario candidato', () => {
    const courts: CourtOccupancy[] = [
      { courtId: 'c1', busy: [{ startMins: 18 * 60, endMins: 19 * 60 }] },
      free('c2'),
    ]
    const pills = pickFreeSlotPills(['18:00', '19:00'], 60, courts, 3)
    expect(pills).toEqual([
      { time: '18:00', courtId: 'c2', durationMins: 60 }, // c1 ocupada 18-19
      { time: '19:00', courtId: 'c1', durationMins: 60 }, // c1 ya libre
    ])
  })

  it('saltea horarios sin ninguna cancha libre (solape parcial incluido)', () => {
    // Reserva 18:30-19:30 solapa tanto el slot 18:00-19:00 como el 19:00-20:00.
    const courts: CourtOccupancy[] = [
      { courtId: 'c1', busy: [{ startMins: 18 * 60 + 30, endMins: 19 * 60 + 30 }] },
    ]
    const pills = pickFreeSlotPills(['18:00', '19:00', '20:00'], 60, courts, 3)
    expect(pills).toEqual([{ time: '20:00', courtId: 'c1', durationMins: 60 }])
  })

  it('corta en el cap aunque haya más horarios libres', () => {
    const pills = pickFreeSlotPills(['18:00', '19:00', '20:00', '21:00'], 60, [free('c1')], 3)
    expect(pills.map((p) => p.time)).toEqual(['18:00', '19:00', '20:00'])
  })

  it('sin canchas devuelve vacío', () => {
    expect(pickFreeSlotPills(['18:00'], 60, [], 3)).toEqual([])
  })

  it('una reserva hasta medianoche normalizada a 24:00 bloquea el último slot', () => {
    // endMins 24*60 representa el guard legacy de time_end 00:00.
    const courts: CourtOccupancy[] = [
      { courtId: 'c1', busy: [{ startMins: 23 * 60, endMins: 24 * 60 }] },
    ]
    expect(pickFreeSlotPills(['23:00'], 60, courts, 3)).toEqual([])
  })
})
