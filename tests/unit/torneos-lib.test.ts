import { describe, expect, it } from 'vitest'
import { formatDate, formatDateRange, summarizeSlots } from '@/app/(admin)/torneos/torneos-lib'

describe('formatDate', () => {
  it('pasa ISO a formato argentino sin corrimiento de zona', () => {
    // Sin `new Date()`: parsear '2026-08-01' como Date y formatearlo en local
    // devolvería 31/07 al oeste de Greenwich.
    expect(formatDate('2026-08-01')).toBe('01/08/2026')
    expect(formatDate('2026-12-31')).toBe('31/12/2026')
  })
})

describe('formatDateRange', () => {
  it('muestra el rango cuando hay fecha de cierre', () => {
    expect(formatDateRange('2026-08-01', '2026-10-15')).toBe('01/08/2026 — 15/10/2026')
  })

  it('muestra una sola fecha cuando arranca y termina el mismo día (relámpago)', () => {
    expect(formatDateRange('2026-08-01', '2026-08-01')).toBe('01/08/2026')
  })

  it('sin cierre, dice "desde"', () => {
    expect(formatDateRange('2026-08-01', null)).toBe('Desde el 01/08/2026')
  })
})

// H027: el `formatArs` local se borró; el canónico de `@/lib/format` tiene su
// propia batería de tests.

describe('summarizeSlots', () => {
  it('resume horas, canchas y fechas distintas', () => {
    const slots = [
      { courtId: 'c1', date: '2026-08-01' },
      { courtId: 'c1', date: '2026-08-01' },
      { courtId: 'c2', date: '2026-08-01' },
      { courtId: 'c1', date: '2026-08-08' },
    ]
    expect(summarizeSlots(slots)).toBe('4 horas · 2 canchas · 2 fechas')
  })

  it('singulariza cuando hay una sola de cada', () => {
    expect(summarizeSlots([{ courtId: 'c1', date: '2026-08-01' }])).toBe(
      '1 hora · 1 cancha · 1 fecha',
    )
  })

  it('avisa cuando no hay nada tomado', () => {
    expect(summarizeSlots([])).toBe('Sin horarios tomados')
  })
})
