// tests/unit/physical-range.test.ts
import { describe, expect, it } from 'vitest'
import { physicalRange } from '@/shared/time/physical-range'

describe('physicalRange', () => {
  it('slot diurno same-day: 20:00–21:00 ART → instantes UTC-3', () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '20:00', timeEnd: '21:00', physicallyNextDay: false })
    expect(r.startsAt.toISOString()).toBe('2026-06-15T23:00:00.000Z')
    expect(r.endsAt.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it("slot 23:00→'24:00' termina exactamente a medianoche ART del día siguiente", () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '23:00', timeEnd: '24:00', physicallyNextDay: false })
    expect(r.startsAt.toISOString()).toBe('2026-06-16T02:00:00.000Z')
    expect(r.endsAt.toISOString()).toBe('2026-06-16T03:00:00.000Z') // 2026-06-16 00:00 ART
  })

  it('slot de madrugada post-medianoche (physicallyNextDay) se desplaza +1 día calendario', () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '01:00', timeEnd: '02:00', physicallyNextDay: true })
    expect(r.startsAt.toISOString()).toBe('2026-06-16T04:00:00.000Z') // 01:00 ART del 16
    expect(r.endsAt.toISOString()).toBe('2026-06-16T05:00:00.000Z')   // 02:00 ART del 16
  })

  it("tolera time con segundos ('20:00:00')", () => {
    const r = physicalRange({ date: '2026-06-15', timeStart: '20:00:00', timeEnd: '21:00:00', physicallyNextDay: false })
    expect(r.startsAt.toISOString()).toBe('2026-06-15T23:00:00.000Z')
  })
})
