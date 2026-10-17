import { describe, expect, it } from 'vitest'
import { buildBookingIcs } from '@/components/booking/booking-ics'

const base = {
  slug: 'el-vagon',
  tenantName: 'El Vagón',
  courtName: 'Cancha 1',
  address: 'Calle 1',
  city: 'Rosario',
  dtStamp: '20261016T120000Z',
}

const line = (ics: string, key: string) => ics.split('\r\n').find((l) => l.startsWith(`${key}:`))

// `startsOn` es el día CALENDARIO (de `starts_at`). Con closes_next_day, el turno de 00:00 del día
// operativo sáb 17/10 se juega el dom 18/10: el calendario del jugador tiene que decir el 18.
describe('buildBookingIcs — día físico', () => {
  it('turno de 00:00 de closes_next_day → DTSTART/DTEND en el día calendario (dom 18, 03:00Z)', () => {
    const ics = buildBookingIcs({
      ...base,
      startsOn: '2026-10-18',
      timeStart: '00:00:00',
      timeEnd: '01:00:00',
    })
    expect(line(ics, 'DTSTART')).toBe('DTSTART:20261018T030000Z')
    expect(line(ics, 'DTEND')).toBe('DTEND:20261018T040000Z')
    expect(line(ics, 'UID')).toBe('UID:el-vagon-2026-10-18-00:00@turnogol')
  })

  it('control negativo: turno de 20:00 (sin cruzar medianoche) → mismo día', () => {
    const ics = buildBookingIcs({
      ...base,
      startsOn: '2026-10-17',
      timeStart: '20:00',
      timeEnd: '21:00',
    })
    expect(line(ics, 'DTSTART')).toBe('DTSTART:20261017T230000Z')
    expect(line(ics, 'DTEND')).toBe('DTEND:20261018T000000Z')
  })

  it('el turno 23:00→24:00 termina a medianoche ART del día siguiente', () => {
    const ics = buildBookingIcs({
      ...base,
      startsOn: '2026-10-17',
      timeStart: '23:00',
      timeEnd: '24:00',
    })
    expect(line(ics, 'DTSTART')).toBe('DTSTART:20261018T020000Z')
    expect(line(ics, 'DTEND')).toBe('DTEND:20261018T030000Z')
  })
})
