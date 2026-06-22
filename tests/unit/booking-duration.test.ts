import { describe, expect, it } from 'vitest'
import { slotDurationMins } from '@/modules/bookings/booking.service'
import { SLOT_DURATION_MINUTES } from '@/shared/constants'

// Tarea #6: el sistema es 100% turnos de 60 minutos.
describe('slotDurationMins', () => {
  it('turno de 60 min', () => {
    expect(slotDurationMins('18:00', '19:00')).toBe(60)
  })

  it('turno que cierra a medianoche (23:00→00:00) = 60 min', () => {
    expect(slotDurationMins('23:00', '00:00')).toBe(60)
  })

  it('turno de 120 min se detecta como != 60', () => {
    expect(slotDurationMins('18:00', '20:00')).toBe(120)
    expect(slotDurationMins('18:00', '20:00')).not.toBe(SLOT_DURATION_MINUTES)
  })

  it('tolera segundos en el string (HH:MM:SS)', () => {
    expect(slotDurationMins('18:00:00', '19:00:00')).toBe(60)
  })
})
