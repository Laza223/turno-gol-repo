import { describe, expect, it } from 'vitest'
import {
  buildTemplateGrid,
  compressGridToRules,
  describeRules,
  expandRulesToGrid,
  countEmptyCells,
  getOperativeHours,
  isHourActive,
  parsePesosToCents,
  uniformRulesFromOpeningHours,
  type PriceGrid,
} from '@/modules/courts/pricing-grid'
import { formatDayList } from '@/shared/time/week-days'
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
  // El formatArs local murió (P0.2): la vista usa el de src/lib/format (Intl es-AR).
  it('parsePesosToCents acepta formato con puntos y símbolo', () => {
    expect(parsePesosToCents('35.000')).toBe(3500000)
    expect(parsePesosToCents('$35.000')).toBe(3500000)
    expect(parsePesosToCents('35000')).toBe(3500000)
    expect(parsePesosToCents('')).toBeNull()
    expect(parsePesosToCents('abc')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Plantilla rápida (pages/horarios-precios.md §3.2)
// ---------------------------------------------------------------------------

describe('buildTemplateGrid', () => {
  it('uniform: llena todas las celdas activas con un precio', () => {
    const oh = uniformHours('08:00', '10:00') // slots 8,9 por día
    const grid = buildTemplateGrid(oh, { mode: 'uniform', price: 2000000 })
    for (const d of DAYS) {
      expect(grid[d]).toEqual({ 8: 2000000, 9: 2000000 })
    }
    expect(countEmptyCells(grid, oh)).toBe(0)
  })

  it('weekSplit: lun-jue precio de semana, vie-dom precio de finde', () => {
    const oh = uniformHours('08:00', '09:00') // slot 8
    const grid = buildTemplateGrid(oh, {
      mode: 'weekSplit',
      weekPrice: 1600000,
      weekendPrice: 2200000,
    })
    expect(grid.mon[8]).toBe(1600000)
    expect(grid.thu[8]).toBe(1600000)
    expect(grid.fri[8]).toBe(2200000)
    expect(grid.sun[8]).toBe(2200000)
  })

  it('dayNight: antes del corte precio de día, desde el corte precio de noche', () => {
    const oh = uniformHours('16:00', '20:00') // slots 16..19
    const grid = buildTemplateGrid(oh, {
      mode: 'dayNight',
      cutHour: 18,
      dayPrice: 1600000,
      nightPrice: 2200000,
    })
    expect(grid.mon).toEqual({ 16: 1600000, 17: 1600000, 18: 2200000, 19: 2200000 })
  })

  it('respeta ventanas por día y días cerrados', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '10:00'),
      sat: day('09:00', '10:00'), // solo slot 9
      sun: day('08:00', '10:00', true), // cerrado
    }
    const grid = buildTemplateGrid(oh, { mode: 'uniform', price: 1000 })
    expect(grid.sat).toEqual({ 9: 1000 })
    expect(grid.sun).toEqual({})
  })

  it('uniform comprimido produce UNA regla para toda la semana', () => {
    const oh = uniformHours('08:00', '23:00')
    const grid = buildTemplateGrid(oh, { mode: 'uniform', price: 2000000 })
    expect(compressGridToRules(grid, oh)).toEqual([
      { days: [...DAYS], from: '08:00', to: '23:00', price: 2000000 },
    ])
  })
})

// ---------------------------------------------------------------------------
// Precio uniforme desde horarios (wizard de onboarding, pages/onboarding.md §5.2)
// ---------------------------------------------------------------------------

describe('uniformRulesFromOpeningHours', () => {
  it('semana uniforme → UNA regla con los 7 días y minutos exactos', () => {
    const oh = uniformHours('08:30', '23:00')
    expect(uniformRulesFromOpeningHours(oh, false, 2000000)).toEqual([
      { days: [...DAYS], from: '08:30', to: '23:00', price: 2000000 },
    ])
  })

  it("cierre '00:00' cuenta como medianoche (regla válida hasta fin de día)", () => {
    const oh = uniformHours('08:00', '00:00')
    expect(uniformRulesFromOpeningHours(oh, false, 1500000)).toEqual([
      { days: [...DAYS], from: '08:00', to: '00:00', price: 1500000 },
    ])
  })

  it('saltea días cerrados y agrupa ventanas distintas en reglas separadas', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '00:00'),
      sat: day('09:00', '23:00'),
      sun: day('08:00', '00:00', true),
    }
    expect(uniformRulesFromOpeningHours(oh, false, 1000)).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '00:00', price: 1000 },
      { days: ['sat'], from: '09:00', to: '23:00', price: 1000 },
    ])
  })

  it('madrugada con flag: parte en [open,00:00) del día + [00:00,close) del día siguiente', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '23:00'),
      fri: day('08:00', '01:00'),
      sat: day('09:00', '01:00'),
    }
    expect(uniformRulesFromOpeningHours(oh, true, 2000000)).toEqual([
      // sáb y dom reciben la madrugada de la noche anterior (día calendario).
      { days: ['sat', 'sun'], from: '00:00', to: '01:00', price: 2000000 },
      { days: ['mon', 'tue', 'wed', 'thu', 'sun'], from: '08:00', to: '23:00', price: 2000000 },
      { days: ['fri'], from: '08:00', to: '00:00', price: 2000000 },
      { days: ['sat'], from: '09:00', to: '00:00', price: 2000000 },
    ])
  })

  it('madrugada SIN flag: el día no genera reglas (coherente con cero slots)', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '23:00'),
      fri: day('08:00', '01:00'),
    }
    const rules = uniformRulesFromOpeningHours(oh, false, 1000)
    expect(rules).toEqual([
      { days: ['mon', 'tue', 'wed', 'thu', 'sat', 'sun'], from: '08:00', to: '23:00', price: 1000 },
    ])
  })

  it('todos los días cerrados → sin reglas', () => {
    const oh = Object.fromEntries(DAYS.map((d) => [d, day('08:00', '23:00', true)])) as OpeningHours
    expect(uniformRulesFromOpeningHours(oh, false, 1000)).toEqual([])
  })

  it('las reglas generadas pasan la cobertura server-side en días normales', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '00:00'),
      sun: day('09:00', '22:00'),
    }
    const rules = uniformRulesFromOpeningHours(oh, false, 2000000)
    const grid = expandRulesToGrid(rules, oh)
    expect(countEmptyCells(grid, oh)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Resumen legible (pages/horarios-precios.md §3.3)
// ---------------------------------------------------------------------------

describe('formatDayList', () => {
  it('colapsa corridas consecutivas', () => {
    expect(formatDayList(['mon', 'tue', 'wed', 'thu'])).toBe('Lun a Jue')
    expect(formatDayList(['fri', 'sat', 'sun'])).toBe('Vie a Dom')
  })

  it('pares y sueltos se unen con "y"', () => {
    expect(formatDayList(['sat', 'sun'])).toBe('Sáb y Dom')
    expect(formatDayList(['mon', 'wed', 'fri'])).toBe('Lun, Mié y Vie')
    expect(formatDayList(['tue'])).toBe('Mar')
  })

  it('los 7 días → "Todos los días" (y el orden de entrada no importa)', () => {
    expect(formatDayList(['sun', 'sat', 'fri', 'thu', 'wed', 'tue', 'mon'])).toBe('Todos los días')
  })

  it('ignora claves desconocidas y duplicados', () => {
    expect(formatDayList(['mon', 'mon', 'xxx'])).toBe('Lun')
    expect(formatDayList([])).toBe('')
  })
})

describe('describeRules', () => {
  it('regla → días colapsados + rango con en-dash + precio', () => {
    const rules: PricingRule[] = [
      { days: ['mon', 'tue', 'wed', 'thu'], from: '08:00', to: '18:00', price: 800000 },
      { days: ['fri', 'sat', 'sun'], from: '08:00', to: '00:00', price: 1500000 },
    ]
    expect(describeRules(rules)).toEqual([
      { daysLabel: 'Lun a Jue', rangeLabel: '08:00–18:00', price: 800000 },
      { daysLabel: 'Vie a Dom', rangeLabel: '08:00–00:00', price: 1500000 },
    ])
  })
})
