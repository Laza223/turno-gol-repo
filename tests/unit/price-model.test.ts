import { describe, expect, it } from 'vitest'
import {
  buildGridFromSimple,
  emptySimplePricing,
  readSimplePricing,
  summarizePricing,
  summaryText,
  type SimplePricing,
} from '@/app/(admin)/canchas/components/price-setup/price-model'
import {
  compressGridToRules,
  countEmptyCells,
  expandRulesToGrid,
  type PriceGrid,
} from '@/modules/courts/pricing-grid'
import type { PricingRule } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'

const open = (o: string, c: string) => ({ open: o, close: c, closed: false })
const closed = { open: '08:00', close: '22:00', closed: true }

/** El Vagón: lunes a viernes de 08 a 01, sábados de 08 a 22, domingos cerrado. */
const VAGON: OpeningHours = {
  mon: open('08:00', '01:00'),
  tue: open('08:00', '01:00'),
  wed: open('08:00', '01:00'),
  thu: open('08:00', '01:00'),
  fri: open('08:00', '01:00'),
  sat: open('08:00', '22:00'),
  sun: closed,
}

const P = (pesos: number) => pesos * 100

function sp(over: Partial<SimplePricing>): SimplePricing {
  return { ...emptySimplePricing(), ...over }
}

/** Ida y vuelta completa: precio simple → grilla → reglas (lo que se guarda) → grilla → precio simple. */
function roundTrip(input: SimplePricing, hours = VAGON, nextDay = true) {
  const grid = buildGridFromSimple(input, hours, nextDay)
  const rules = compressGridToRules(grid, hours, nextDay)
  const back = expandRulesToGrid(rules, hours, nextDay)
  return { grid, rules, back, read: readSimplePricing(back, hours, nextDay) }
}

describe('buildGridFromSimple', () => {
  it('un solo precio llena todas las horas en que se abre, madrugada incluida', () => {
    const grid = buildGridFromSimple(sp({ base: { day: P(84000), night: null } }), VAGON, true)
    expect(countEmptyCells(grid, VAGON, true)).toBe(0)
    // 00:00–01:00 del viernes operativo es la hora 24 del eje continuo.
    expect(grid.fri[24]).toBe(P(84000))
    expect(grid.sun).toEqual({})
  })

  it('con noche, las horas desde el corte (y la madrugada) toman el precio de noche', () => {
    const grid = buildGridFromSimple(
      sp({ nightFrom: 18, base: { day: P(60000), night: P(84000) } }),
      VAGON,
      true,
    )
    expect(grid.mon[17]).toBe(P(60000))
    expect(grid.mon[18]).toBe(P(84000))
    expect(grid.mon[24]).toBe(P(84000))
  })

  it('un precio que falta deja esas horas vacías (y el guardado las frena)', () => {
    const grid = buildGridFromSimple(
      sp({ nightFrom: 18, base: { day: P(60000), night: null } }),
      VAGON,
      true,
    )
    expect(grid.mon[17]).toBe(P(60000))
    expect(grid.mon[18]).toBeUndefined()
    expect(countEmptyCells(grid, VAGON, true)).toBeGreaterThan(0)
  })
})

describe('readSimplePricing — ida y vuelta por el formato que se guarda', () => {
  const cases: [string, SimplePricing][] = [
    ['precio único', sp({ base: { day: P(84000), night: null } })],
    ['día y noche', sp({ nightFrom: 18, base: { day: P(60000), night: P(84000) } })],
    [
      'sábado distinto',
      sp({
        otherDays: ['sat'],
        base: { day: P(60000), night: null },
        other: { day: P(70000), night: null },
      }),
    ],
    [
      'día, noche y sábado distinto',
      sp({
        nightFrom: 18,
        otherDays: ['sat'],
        base: { day: P(60000), night: P(84000) },
        other: { day: P(70000), night: P(90000) },
      }),
    ],
  ]

  for (const [name, input] of cases) {
    it(name, () => {
      const { grid, back, read } = roundTrip(input)
      expect(back).toEqual(grid)
      expect(read).not.toBeNull()
      // Leerlo y volver a armarlo da la MISMA grilla: nunca pisa un precio.
      expect(buildGridFromSimple(read!, VAGON, true)).toEqual(grid)
    })
  }

  it('grilla vacía = precio simple vacío (así arranca una cancha nueva)', () => {
    expect(readSimplePricing(expandRulesToGrid([], VAGON, true), VAGON, true)).toEqual(
      emptySimplePricing(),
    )
  })

  it('el día que es el "resto" es el que tiene más días, no el orden de las reglas', () => {
    const { read } = roundTrip(
      sp({
        otherDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        base: { day: P(90000), night: null },
        other: { day: P(60000), night: null },
      }),
    )
    // Lunes a viernes son 5 días contra 1: pasan a ser la base.
    expect(read!.otherDays).toEqual(['sat'])
    expect(read!.base.day).toBe(P(60000))
    expect(read!.other.day).toBe(P(90000))
  })

  it('un día que cierra antes del corte de la noche calza con el grupo de su precio de día', () => {
    // Sábado cierra 22: si la noche arranca a las 23 el sábado no tiene noche.
    const input = sp({ nightFrom: 23, base: { day: P(60000), night: P(84000) } })
    const { read } = roundTrip(input)
    expect(read).toEqual(input)
  })

  it('tres franjas en un día no entran en las dos preguntas: se edita hora por hora', () => {
    const rules: PricingRule[] = [
      { days: ['mon'], from: '08:00', to: '14:00', price: P(70000) },
      { days: ['mon'], from: '14:00', to: '19:00', price: P(90000) },
      { days: ['mon'], from: '19:00', to: '00:00', price: P(110000) },
      { days: ['mon'], from: '00:00', to: '01:00', price: P(110000) },
    ]
    const hours: OpeningHours = {
      ...VAGON,
      tue: closed,
      wed: closed,
      thu: closed,
      fri: closed,
      sat: closed,
    }
    expect(readSimplePricing(expandRulesToGrid(rules, hours, true), hours, true)).toBeNull()
  })

  it('cortes de noche distintos según el día: hora por hora', () => {
    const grid = buildGridFromSimple(
      sp({ nightFrom: 18, base: { day: P(60000), night: P(84000) } }),
      VAGON,
      true,
    )
    const edited: PriceGrid = { ...grid, tue: { ...grid.tue, 18: P(60000) } }
    expect(readSimplePricing(edited, VAGON, true)).toBeNull()
  })

  it('tres grupos de días distintos: hora por hora', () => {
    const grid = buildGridFromSimple(sp({ base: { day: P(60000), night: null } }), VAGON, true)
    const edited: PriceGrid = {
      ...grid,
      fri: Object.fromEntries(Object.keys(grid.fri).map((h) => [h, P(70000)])),
      sat: Object.fromEntries(Object.keys(grid.sat).map((h) => [h, P(80000)])),
    }
    expect(readSimplePricing(edited, VAGON, true)).toBeNull()
  })

  it('una hora sin precio en una grilla con precios: no se adivina, hora por hora', () => {
    const grid = buildGridFromSimple(sp({ base: { day: P(60000), night: null } }), VAGON, true)
    const { 10: _gap, ...monWithGap } = grid.mon
    expect(readSimplePricing({ ...grid, mon: monWithGap }, VAGON, true)).toBeNull()
  })
})

describe('summarizePricing', () => {
  const rulesOf = (input: SimplePricing) =>
    compressGridToRules(buildGridFromSimple(input, VAGON, true), VAGON, true)

  it('precio único: una línea, un precio', () => {
    const s = summarizePricing(rulesOf(sp({ base: { day: P(84000), night: null } })), VAGON, true)
    expect(s).toEqual({
      kind: 'simple',
      lines: [{ days: null, parts: [{ price: P(84000), label: null }] }],
    })
  })

  it('día y noche dicen hasta y desde qué hora', () => {
    const s = summarizePricing(
      rulesOf(sp({ nightFrom: 18, base: { day: P(60000), night: P(84000) } })),
      VAGON,
      true,
    )
    expect(summaryText(s)).toBe(
      '$ 60.000 hasta las 18:00 y $ 84.000 desde las 18:00'.replace(/\$ /g, '$ '),
    )
  })

  it('con días distintos, cada línea dice sus días (los cerrados no cuentan)', () => {
    const s = summarizePricing(
      rulesOf(
        sp({
          otherDays: ['sat'],
          base: { day: P(60000), night: null },
          other: { day: P(70000), night: null },
        }),
      ),
      VAGON,
      true,
    )
    expect(s.kind === 'simple' && s.lines.map((l) => l.days)).toEqual(['Lun a Vie', 'Sáb'])
  })

  it('hora por hora se resume como rango', () => {
    const rules: PricingRule[] = [
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '08:00', to: '14:00', price: P(70000) },
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '14:00', to: '19:00', price: P(90000) },
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '19:00', to: '00:00', price: P(110000) },
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '00:00', to: '01:00', price: P(110000) },
      { days: ['sat'], from: '08:00', to: '22:00', price: P(100000) },
    ]
    expect(summarizePricing(rules, VAGON, true)).toEqual({
      kind: 'custom',
      min: P(70000),
      max: P(110000),
    })
  })

  it('sin reglas: sin precio', () => {
    expect(summarizePricing([], VAGON, true)).toEqual({ kind: 'empty' })
  })
})
