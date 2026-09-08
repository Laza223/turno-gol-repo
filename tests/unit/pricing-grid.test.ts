import { describe, expect, it } from 'vitest'
import {
  activeHoursForDay,
  buildTemplateGrid,
  compressGridToRules,
  describeRules,
  expandRulesToGrid,
  countEmptyCells,
  fillGridGaps,
  getOperativeHours,
  hourLabel,
  isHourActive,
  parsePesosToCents,
  uniformRulesFromOpeningHours,
  type PriceGrid,
} from '@/modules/courts/pricing-grid'
import { priceForDateSlot } from '@/lib/booking/pricing'
import { validatePricingRulesCoverage } from '@/modules/courts/court.service'
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

    const rules = compressGridToRules(grid, oh, false)

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

    const grid = expandRulesToGrid(rules, oh, false)
    const out = compressGridToRules(grid, oh, false)

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

    const rules = compressGridToRules(grid, oh, false)

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

    const rules = compressGridToRules(grid, oh, false)

    expect(rules).toEqual([
      { days: ['mon'], from: '08:00', to: '10:00', price: 1000 },
      { days: ['mon'], from: '10:00', to: '11:00', price: 2000 },
    ])
  })

  it('el último slot del día (23:00) cierra el intervalo en 00:00 (medianoche)', () => {
    const oh = uniformHours('08:00', '00:00')
    const grid = emptyGrid()
    grid.mon[23] = 5000

    const rules = compressGridToRules(grid, oh, false)

    expect(rules).toEqual([{ days: ['mon'], from: '23:00', to: '00:00', price: 5000 }])
  })

  it('omite celdas fuera de la ventana operativa', () => {
    // mon abre 18:00–00:00; una celda a las 10:00 no es activa y se ignora.
    const oh = uniformHours('18:00', '00:00')
    const grid = emptyGrid()
    grid.mon[10] = 9999 // fuera de ventana
    grid.mon[18] = 1000

    const rules = compressGridToRules(grid, oh, false)

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
    expect(getOperativeHours(oh, false)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ])
    expect(isHourActive(oh.sat, 9, false)).toBe(false) // sat abre 10
    expect(isHourActive(oh.sat, 22, false)).toBe(true)
    expect(isHourActive(oh.sat, 23, false)).toBe(false) // close 23 exclusivo
    expect(isHourActive(oh.tue, 12, false)).toBe(false) // cerrado
  })

  it('sin días abiertos devuelve grilla vacía', () => {
    const oh = Object.fromEntries(DAYS.map((d) => [d, day('00:00', '00:00', true)])) as OpeningHours
    expect(getOperativeHours(oh, false)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Bug real: "El Vagón Deportivo" abre lun-vie 08:00→01:00 (closesNextDay),
// sáb 08:00-22:00, dom cerrado. Sin conocer closesNextDay, closeHour('01:00')
// truncaba a la hora 1 (< la apertura 8): isHourActive/activeHoursForDay
// devolvían [] para esos 5 días → sin precio posible → PriceUnavailableError
// al reservar. effectiveCloseMins (operating-day.ts) es la fuente única de
// esta aritmética; acá solo se verifica que pricing-grid.ts la use de verdad.
// ---------------------------------------------------------------------------
describe('closesNextDay: complejo que cierra pasada medianoche (El Vagón)', () => {
  const VAGON_HOURS: OpeningHours = {
    mon: day('08:00', '01:00'),
    tue: day('08:00', '01:00'),
    wed: day('08:00', '01:00'),
    thu: day('08:00', '01:00'),
    fri: day('08:00', '01:00'),
    sat: day('08:00', '22:00'),
    sun: day('00:00', '00:00', true),
  }

  it('a) activeHoursForDay: lunes da 8..24 (17 slots), NO vacío', () => {
    const hours = activeHoursForDay(VAGON_HOURS, 'mon', true)
    expect(hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])
  })

  it('b) getOperativeHours incluye lun-vie en el rango de filas (no las excluye)', () => {
    const hours = getOperativeHours(VAGON_HOURS, true)
    // unión: min 8 (todos), max 25 (lun-vie extienden hasta la 01:00 = hora 24
    // inclusive, cota exclusiva 25) → filas 8..24, sáb queda adentro del rango.
    expect(hours[0]).toBe(8)
    expect(hours.at(-1)).toBe(24)
    expect(hours).toContain(24) // fila de madrugada (00:00), antes bug daba []
  })

  it('c) compressGridToRules NO borra las reglas de lun-vie al guardar', () => {
    // Grilla con precio cargado en TODAS las horas activas de lunes (8..24).
    const grid = emptyGrid()
    for (const h of activeHoursForDay(VAGON_HOURS, 'mon', true)) {
      grid.mon[h] = 2000000
    }
    const rules = compressGridToRules(grid, VAGON_HOURS, true)
    const monRules = rules.filter((r) => r.days.includes('mon'))
    // Antes del fix: [] (compressGridToRules filtraba por activeHoursForDay,
    // que ya daba [] para lunes — la pérdida de datos silenciosa del bug).
    expect(monRules.length).toBeGreaterThan(0)
    // Cubre las 08:00-00:00 y 00:00-01:00 (partido en 2: priceForSlot no
    // entiende una regla que cruza medianoche dentro de un mismo string).
    const totalPrice = monRules.reduce((acc, r) => acc + (r.price === 2000000 ? 1 : 0), 0)
    expect(totalPrice).toBe(monRules.length)
  })

  it('f) hourLabel: wraparound general, sin colisión 24/25/26', () => {
    expect(hourLabel(24)).toBe('00:00')
    expect(hourLabel(25)).toBe('01:00')
    expect(hourLabel(26)).toBe('02:00')
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
    expect(countEmptyCells(grid, oh, false)).toBe(1)
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
    const grid = buildTemplateGrid(oh, { mode: 'uniform', price: 2000000 }, false)
    for (const d of DAYS) {
      expect(grid[d]).toEqual({ 8: 2000000, 9: 2000000 })
    }
    expect(countEmptyCells(grid, oh, false)).toBe(0)
  })

  it('weekSplit: lun-jue precio de semana, vie-dom precio de finde', () => {
    const oh = uniformHours('08:00', '09:00') // slot 8
    const grid = buildTemplateGrid(
      oh,
      { mode: 'weekSplit', weekPrice: 1600000, weekendPrice: 2200000 },
      false,
    )
    expect(grid.mon[8]).toBe(1600000)
    expect(grid.thu[8]).toBe(1600000)
    expect(grid.fri[8]).toBe(2200000)
    expect(grid.sun[8]).toBe(2200000)
  })

  it('dayNight: antes del corte precio de día, desde el corte precio de noche', () => {
    const oh = uniformHours('16:00', '20:00') // slots 16..19
    const grid = buildTemplateGrid(
      oh,
      { mode: 'dayNight', cutHour: 18, dayPrice: 1600000, nightPrice: 2200000 },
      false,
    )
    expect(grid.mon).toEqual({ 16: 1600000, 17: 1600000, 18: 2200000, 19: 2200000 })
  })

  it('respeta ventanas por día y días cerrados', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '10:00'),
      sat: day('09:00', '10:00'), // solo slot 9
      sun: day('08:00', '10:00', true), // cerrado
    }
    const grid = buildTemplateGrid(oh, { mode: 'uniform', price: 1000 }, false)
    expect(grid.sat).toEqual({ 9: 1000 })
    expect(grid.sun).toEqual({})
  })

  it('uniform comprimido produce UNA regla para toda la semana', () => {
    const oh = uniformHours('08:00', '23:00')
    const grid = buildTemplateGrid(oh, { mode: 'uniform', price: 2000000 }, false)
    expect(compressGridToRules(grid, oh, false)).toEqual([
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

  // Antes del fix esta franja se etiquetaba con el día CALENDARIO siguiente
  // (['sat','sun']): parecía razonable ("el turno de la 01:00 del sábado es
  // la madrugada del viernes... pero cae en sábado calendario"), y hasta tenía
  // un test que lo fijaba a propósito. El problema es que TODO el resto del
  // sistema (priceForSlot/priceForDateSlot, calculatePrice, generateSlots)
  // busca la regla de precio por DÍA OPERATIVO — "bookings.date es el día
  // operativo, no el calendario" (CLAUDE.md) — y bookings.date de un turno de
  // madrugada es el día en que EMPEZÓ la noche, no el día calendario en que
  // cae la hora de pared. Etiquetar con el día calendario siguiente dejaba esa
  // franja sin precio (o con el precio equivocado) para cualquier complejo
  // closesNextDay: exactamente el bug de "El Vagón Deportivo".
  it('madrugada con flag: parte en [open,00:00) + [00:00,close), AMBAS del MISMO día operativo', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '23:00'),
      fri: day('08:00', '01:00'),
      sat: day('09:00', '01:00'),
    }
    expect(uniformRulesFromOpeningHours(oh, true, 2000000)).toEqual([
      // la madrugada de fri/sat queda tageada con fri/sat (no con sat/sun).
      { days: ['fri', 'sat'], from: '00:00', to: '01:00', price: 2000000 },
      { days: ['mon', 'tue', 'wed', 'thu', 'sun'], from: '08:00', to: '23:00', price: 2000000 },
      { days: ['fri'], from: '08:00', to: '00:00', price: 2000000 },
      { days: ['sat'], from: '09:00', to: '00:00', price: 2000000 },
    ])
  })

  it('e) el día operativo es la convención correcta: el lookup real de precio (priceForDateSlot) encuentra la franja de madrugada', () => {
    // El complejo cierra viernes a la 01:00 (closesNextDay). bookings.date de
    // ese turno de madrugada es el VIERNES operativo (no sábado calendario) —
    // así lo escribe cualquier generador de slots. Si uniformRulesFromOpeningHours
    // etiquetara la regla con 'sat' (el bug original), este lookup por día
    // operativo 'fri' fallaría y el turno de la 00:30 quedaría sin precio.
    const oh: OpeningHours = {
      ...uniformHours('08:00', '23:00'),
      fri: day('08:00', '01:00'),
    }
    const rules = uniformRulesFromOpeningHours(oh, true, 2000000)
    // 2026-09-04 es viernes calendario (UTC — dayKeyOf lee el date-string como
    // fecha UTC pura, sin zona horaria). Un turno de madrugada que arrancó la
    // noche del viernes se guarda con date='2026-09-04' (el día OPERATIVO en
    // que empezó la noche), aunque su hora de pared (00:30) ya sea sábado.
    const price = priceForDateSlot({ rules }, '2026-09-04', '00:30')
    expect(price).toBe(2000000)
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
    const grid = expandRulesToGrid(rules, oh, false)
    expect(countEmptyCells(grid, oh, false)).toBe(0)
  })

  it('las reglas de madrugada también pasan la cobertura server-side (closesNextDay)', () => {
    const oh: OpeningHours = {
      ...uniformHours('08:00', '23:00'),
      fri: day('08:00', '01:00'),
      sat: day('09:00', '01:00'),
    }
    const rules = uniformRulesFromOpeningHours(oh, true, 2000000)
    const grid = expandRulesToGrid(rules, oh, true)
    expect(countEmptyCells(grid, oh, true)).toBe(0)
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

// ---------------------------------------------------------------------------
// Auto-relleno de horas sin precio (decisión del dueño): un cambio de horario
// no puede dejar franjas irreservables en silencio. Orden de preferencia:
// a) hora anterior mismo día, b) hora siguiente mismo día, c) misma hora en
// el día abierto más cercano, d) precio más frecuente de toda la grilla.
// ---------------------------------------------------------------------------
describe('fillGridGaps', () => {
  // Solo lunes abierto (el resto cerrado): aísla el caso intra-día de la
  // herencia cruzada entre días (c), que se testea aparte más abajo.
  const ONLY_MON: OpeningHours = Object.fromEntries(
    DAYS.map((d) => [d, d === 'mon' ? day('08:00', '12:00') : day('00:00', '00:00', true)]),
  ) as OpeningHours

  it('a1) celda vacía en el medio hereda de la hora anterior', () => {
    const grid = emptyGrid()
    grid.mon[8] = 1000
    grid.mon[9] = 1000
    // hueco en 10
    grid.mon[11] = 2000

    const { grid: out, filled } = fillGridGaps(grid, ONLY_MON, false)

    expect(out.mon[10]).toBe(1000) // hereda de la hora anterior (9), no de la siguiente (11)
    expect(filled).toEqual([{ day: 'mon', hour: 10, price: 1000 }])
  })

  it('a2) celda vacía al principio del día hereda de la siguiente (no hay hora anterior)', () => {
    const grid = emptyGrid()
    // hueco en el primer slot (8): no hay hora anterior activa ese día
    grid.mon[9] = 1500
    grid.mon[10] = 1500
    grid.mon[11] = 1500

    const { grid: out, filled } = fillGridGaps(grid, ONLY_MON, false)

    expect(out.mon[8]).toBe(1500)
    expect(filled).toEqual([{ day: 'mon', hour: 8, price: 1500 }])
  })

  it('a3) un día entero vacío hereda de la MISMA hora en el día abierto más cercano', () => {
    const oh = uniformHours('08:00', '10:00') // slots 8,9 todos los días
    const grid = emptyGrid()
    // Solo sábado tiene precio cargado — el resto de la semana está vacío.
    grid.sat[8] = 3000
    grid.sat[9] = 4000

    const { grid: out, filled } = fillGridGaps(grid, oh, false)

    for (const d of DAYS) {
      expect(out[d][8]).toBe(3000)
      expect(out[d][9]).toBe(4000)
    }
    // sábado no se toca (ya tenía precio): no aparece en el detalle de relleno.
    expect(filled.some((f) => f.day === 'sat')).toBe(false)
    expect(filled.length).toBe(2 * 6) // 6 días vacíos × 2 horas
  })

  it('a4) grilla completamente vacía queda igual: sin precio no hay nada que heredar', () => {
    const oh = uniformHours('08:00', '10:00')
    const grid = emptyGrid()

    const { grid: out, filled } = fillGridGaps(grid, oh, false)

    expect(out).toEqual(emptyGrid())
    expect(filled).toEqual([])
  })

  it('respeta el orden de preferencia: hora anterior antes que hora siguiente', () => {
    const oh = uniformHours('08:00', '13:00') // slots 8..12
    const grid = emptyGrid()
    grid.mon[8] = 1000
    // hueco en 9 y 10
    grid.mon[11] = 5000
    grid.mon[12] = 5000

    const { grid: out } = fillGridGaps(grid, oh, false)

    // 9 hereda de 8 (anterior), y ESO deja 10 con una hora anterior recién
    // rellenada (también 1000) — no salta a heredar del lado derecho (5000).
    expect(out.mon[9]).toBe(1000)
    expect(out.mon[10]).toBe(1000)
  })

  it('respeta el orden de preferencia: hora en otro día antes que el precio más frecuente', () => {
    // Sábado abre en una franja horaria que ningún otro día pisa (10:00–11:00,
    // un único slot): la hora 10 no tiene vecino en su propio día (a/b no
    // aplican) NI la misma hora en ningún otro día (c no aplica) → sólo puede
    // resolverse con (d), el precio más frecuente de toda la grilla.
    const oh: OpeningHours = {
      ...uniformHours('08:00', '10:00'), // slots 8,9 en el resto de los días
      sat: day('10:00', '11:00'), // único slot: la hora 10
    }
    const grid = emptyGrid()
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sun'] as const) {
      grid[d][8] = 1000
      grid[d][9] = 1000
    }
    // sat[10] queda sin precio a propósito.

    const { grid: out, filled } = fillGridGaps(grid, oh, false)

    // Cae al fallback (d): precio más frecuente de la grilla (1000, el único).
    expect(out.sat[10]).toBe(1000)
    expect(filled).toEqual([{ day: 'sat', hour: 10, price: 1000 }])
  })

  it('b) caso real: lun-vie 08:00–01:00 (closesNextDay), sáb 08:00–22:00, dom cerrado, precio solo en sábado', () => {
    const oh: OpeningHours = {
      mon: day('08:00', '01:00'),
      tue: day('08:00', '01:00'),
      wed: day('08:00', '01:00'),
      thu: day('08:00', '01:00'),
      fri: day('08:00', '01:00'),
      sat: day('08:00', '22:00'),
      sun: day('00:00', '00:00', true),
    }
    const grid = emptyGrid()
    for (const h of activeHoursForDay(oh, 'sat', true)) grid.sat[h] = 2000000

    const { grid: out } = fillGridGaps(grid, oh, true)

    const coverage = validatePricingRulesCoverage(compressGridToRules(out, oh, true), oh, true)
    expect(coverage.valid).toBe(true)
    expect(coverage.gaps).toEqual([])
  })

  it('b2) con soloVecinoDelMismoDia NO copia la tarifa del sábado a los días de semana', () => {
    // Mismo complejo que el caso b, pero por el camino que corre SIN que nadie
    // mire la grilla (guardado de horarios). Ahí completar lunes a viernes con
    // el precio del sábado sería cobrarle al jugador la tarifa de fin de semana
    // toda la semana, escrita sola y sin confirmación: preferimos el hueco
    // avisado. El relleno del mismo día sí corre.
    const oh: OpeningHours = {
      mon: day('08:00', '01:00'),
      tue: day('08:00', '01:00'),
      wed: day('08:00', '01:00'),
      thu: day('08:00', '01:00'),
      fri: day('08:00', '01:00'),
      sat: day('08:00', '22:00'),
      sun: day('00:00', '00:00', true),
    }
    const grid = emptyGrid()
    for (const h of activeHoursForDay(oh, 'sat', true)) grid.sat[h] = 2000000

    const { grid: out, filled } = fillGridGaps(grid, oh, true, null, true)

    expect(filled).toEqual([])
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
      for (const h of activeHoursForDay(oh, d, true)) {
        expect(out[d][h]).toBeUndefined()
      }
    }
    // Y el hueco queda contado, que es lo que dispara el aviso al dueño.
    expect(countEmptyCells(out, oh, true)).toBeGreaterThan(0)
  })

  it('b3) con soloVecinoDelMismoDia sí completa la hora nueva desde su vecina', () => {
    const before = uniformHours('08:00', '00:00')
    const grid = emptyGrid()
    for (const d of DAYS) {
      for (const h of activeHoursForDay(before, d, false)) grid[d][h] = 1800000
    }
    const after: OpeningHours = { ...before, mon: day('08:00', '01:00') }

    const { grid: out, filled } = fillGridGaps(grid, after, true, null, true)

    expect(out.mon[24]).toBe(1800000)
    expect(filled).toEqual([{ day: 'mon', hour: 24, price: 1800000 }])
    expect(countEmptyCells(out, after, true)).toBe(0)
  })

  it('c) ampliar el horario (cerrar más tarde) deja la hora nueva cubierta, no vacía', () => {
    const before = uniformHours('08:00', '00:00') // slots 8..23, todos los días
    const grid = emptyGrid()
    for (const d of DAYS) {
      for (const h of activeHoursForDay(before, d, false)) grid[d][h] = 1800000
    }

    // El complejo amplía: ahora cierra a la 01:00 (closesNextDay) → aparece la
    // hora 24 (madrugada) el lunes, sin precio en la grilla existente.
    const after: OpeningHours = { ...before, mon: day('08:00', '01:00') }
    expect(countEmptyCells(grid, after, true)).toBe(1) // la hora 24, nueva

    const { grid: out, filled } = fillGridGaps(grid, after, true)

    expect(out.mon[24]).toBe(1800000) // hereda de la hora anterior (23)
    expect(filled).toEqual([{ day: 'mon', hour: 24, price: 1800000 }])
    expect(countEmptyCells(out, after, true)).toBe(0)
  })
})
