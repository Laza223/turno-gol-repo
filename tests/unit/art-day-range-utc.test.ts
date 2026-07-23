import { describe, expect, it } from 'vitest'
import { artDayRangeUtc, artDateOf } from '@/shared/time/art-date'

// Regresión D3: los filtros de "día operativo ART" migraron de la expresión
// `(occurred_at AT TIME ZONE ...)::date = X` (no sargable bajo RLS: timezone()
// no es LEAKPROOF) al rango UTC [date 03:00Z, date+1 03:00Z). Este test fija
// la equivalencia semántica del rango con el día ART.
describe('artDayRangeUtc', () => {
  it('un día ART = [03:00Z del día, 03:00Z del siguiente)', () => {
    const { fromUtc, toUtc } = artDayRangeUtc('2026-07-22')
    expect(fromUtc.toISOString()).toBe('2026-07-22T03:00:00.000Z')
    expect(toUtc.toISOString()).toBe('2026-07-23T03:00:00.000Z')
  })

  it('rango multi-día: from inclusive, to exclusivo al día siguiente', () => {
    const { fromUtc, toUtc } = artDayRangeUtc('2026-07-15', '2026-07-21')
    expect(fromUtc.toISOString()).toBe('2026-07-15T03:00:00.000Z')
    expect(toUtc.toISOString()).toBe('2026-07-22T03:00:00.000Z')
  })

  it('equivalencia con artDateOf en los bordes del día ART', () => {
    const { fromUtc, toUtc } = artDayRangeUtc('2026-07-22')
    // Primer instante del día ART pertenece al día; el último milisegundo antes
    // de toUtc también; toUtc ya es el día siguiente.
    expect(artDateOf(fromUtc)).toBe('2026-07-22')
    expect(artDateOf(new Date(toUtc.getTime() - 1))).toBe('2026-07-22')
    expect(artDateOf(toUtc)).toBe('2026-07-23')
  })

  it('una venta 01:30 ART (madrugada) cae en el día operativo correcto', () => {
    // 2026-07-23 01:30 ART = 2026-07-23 04:30 UTC → día ART 2026-07-23.
    const sale = new Date('2026-07-23T04:30:00.000Z')
    const day = artDayRangeUtc('2026-07-23')
    expect(sale >= day.fromUtc && sale < day.toUtc).toBe(true)
    // Y NO cae en el día anterior.
    const prev = artDayRangeUtc('2026-07-22')
    expect(sale >= prev.fromUtc && sale < prev.toUtc).toBe(false)
  })
})
