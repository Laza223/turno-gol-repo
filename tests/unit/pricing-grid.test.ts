import { describe, expect, it } from 'vitest'
import {
  compressGridToRules,
  expandRulesToGrid,
  countEmptyCells,
  formatArs,
  getOperativeHours,
  isHourActive,
  parsePesosToCents,
  type PriceGrid,
} from '@/modules/courts/pricing-grid'
import type { PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours, OpeningHoursDay } from '@/modules/tenants/tenant.types'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function day(open: string, close: string, closed = false): OpeningHoursDay {
  return { open, close, closed }
}

// Todos los días con la misma ventana.
function uniformHours(open: string, close: string): OpeningHours {
  return Object.fromEntries(DAYS.map((d) => [d, day(open, close)])) as OpeningHours

}

// Grilla vacía con la forma de OpeningHours.
function emptyGrid(): PriceGrid {
  return Object.fromEntries(DAYS.map((d) => [d, {}])) as PriceGrid
}

describe('compressGridToRules', () => {
  it('comprime un bloque lun-jue 08:00–17:00 con mismo precio en una sola regla (verificación #3)', () => {
    const oh = uniformHours('08:00', '00:00')
    const grid = emptyGrid()
    // Celdas lun-jue para la ventana 08:00–17:00 → slots 8..16.
    for (const d of ['mon', 'tue', 'wed', 'thu'] as const) {
      for (let h = 8; h <= 16; h++) grid[d][h] = 3500000
    }

    const rules = compressGridToRules(grid, oh)

    expect(rules).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu'], from: '08:00', to: '17:00', price: 3500000 },
    ])
  })

  it('round-trip: expandir reglas y volver a comprimir reproduce el set', () => {
    const oh = uniformHours('08:00', '00:00')
    const rules: PricingRule[] = [
      { days: ['mon', 'tue', 'wed', 'thu'], from: '08:00', to: '18:00', price: 800000 },
      { days: ['mon', 'tue', 'wed', 'thu'], from: '18:00', to: '00:00', price: 1200000 },
      { days: ['fri', 'sat', 'sun'], from: '08:00', to: '00:00', price: 1500000 },
    ]

    const grid = expandRulesToGrid(rules, oh)
    const out = compressGridToRules(grid, oh)

    expect(out).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu'], from: '08:00', to: '18:00', price: 800000 },
      { days: ['fri', 'sat', 'sun'], from: '08:00', to: '00:00', price: 1500000 },
      { days: ['mon', 'tue', 'wed', 'thu'], from: '18:00', to: '00:00', price: 1200000 },
    ])
  })

  it('una celda vacía intercalada corta el intervalo aunque el precio sea igual', () => {
    const oh = uniformHours('08:00', '00:00')
    const grid = emptyGrid()
    grid.mon[8] = 1000
    grid.mon[9] = 1000
    // hueco en la hora 10
    grid.mon[11] = 1000
    grid.mon[12] = 1000

    const rules = compressGridToRules(grid, oh)

    expect(rules).toEqual([
      { days: ['mon'], from: '08:00', to: '10:00', price: 1000 },
      { days: ['mon'], from: '11:00', to: '13:00', price: 1000 },
    ])
  })

  it('un cambio de precio corta el intervalo', () => {
    const oh = uniformHours('08:00', '00:00')
    const grid = emptyGrid()
    grid.mon[8] = 1000
    grid.mon[9] = 1000
    grid.mon[10] = 2000

    const rules = compressGridToRules(grid, oh)

    expect(rules).toEqual([
      { days: ['mon'], from: '08:00', to: '10:00', price: 1000 },
      { days: ['mon'], from: '10:00', to: '11:00', price: 2000 },
    ])
  })

  it('el último slot del día (23:00) cierra el intervalo en 00:00 (medianoche)', () => {
    const oh = uniformHours('08:00', '00:00')
    const grid = emptyGrid()
    grid.mon[23] = 5000

    const rules = compressGridToRules(grid, oh)

    expect(rules).toEqual([{ days: ['mon'], from: '23:00', to: '00:00', price: 5000 }])
  })

  it('omite celdas fuera de la ventana operativa', () => {
    // mon abre 18:00–00:00; una celda a las 10:00 no es activa y se ignora.
    const oh = uniformHours('18:00', '00:00')
    const grid = emptyGrid()
    grid.mon[10] = 9999 // fuera de ventana
    grid.mon[18] = 1000

    const rules = compressGridToRules(grid, oh)

    expect(rules).toEqual([{ days: ['mon'], from: '18:00', to: '19:00', price: 1000 }])
  })
})

describe('getOperativeHours / isHourActive', () => {
  it('toma la unión de ventanas de los días abiertos', () => {
    const oh: OpeningHours = {
      mon: day('08:00', '00:00'),
      tue: day('00:00', '00:00', true),
      wed: day('00:00', '00:00', true),
      thu: day('00:00', '00:00', true),
      fri: day('00:00', '00:00', true),
      sat: day('10:00', '23:00'),
      sun: day('00:00', '00:00', true),
    }
    // unión: min 8, max 24 → 8..23
    expect(getOperativeHours(oh)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])
    expect(isHourActive(oh.sat, 9)).toBe(false) // sat abre 10
    expect(isHourActive(oh.sat, 22)).toBe(true)
    expect(isHourActive(oh.sat, 23)).toBe(false) // close 23 exclusivo
    expect(isHourActive(oh.tue, 12)).toBe(false) // cerrado
  })

  it('sin días abiertos devuelve grilla vacía', () => {
    const oh = Object.fromEntries(
      DAYS.map((d) => [d, day('00:00', '00:00', true)]),
    ) as OpeningHours
    expect(getOperativeHours(oh)).toEqual([])
  })
})

describe('countEmptyCells', () => {
  it('cuenta solo celdas activas sin precio', () => {
    const oh: OpeningHours = {
      mon: day('08:00', '10:00'), // slots 8,9
      tue: day('00:00', '00:00', true),
      wed: day('00:00', '00:00', true),
      thu: day('00:00', '00:00', true),
      fri: day('00:00', '00:00', true),
      sat: day('00:00', '00:00', true),
      sun: day('00:00', '00:00', true),
    }
    const grid = emptyGrid()
    grid.mon[8] = 1000 // 9 queda vacío
    expect(countEmptyCells(grid, oh)).toBe(1)
  })
})

describe('formato de pesos', () => {
  it('formatArs usa separador de miles argentino', () => {
    expect(formatArs(3500000)).toBe('$35.000')
    expect(formatArs(1500000)).toBe('$15.000')
    expect(formatArs(100000)).toBe('$1.000')
    expect(formatArs(50000)).toBe('$500')
  })

  it('parsePesosToCents acepta formato con puntos y símbolo', () => {
    expect(parsePesosToCents('35.000')).toBe(3500000)
    expect(parsePesosToCents('$35.000')).toBe(3500000)
    expect(parsePesosToCents('35000')).toBe(3500000)
    expect(parsePesosToCents('')).toBeNull()
    expect(parsePesosToCents('abc')).toBeNull()
  })
})
