import { describe, expect, it } from 'vitest'
import type { WeekRevenue } from './report.types'
import { buildWeeklySummary, weeklySummaryWeekStart } from './weekly-summary'

/** `formatArs` separa el `$` con un NBSP; acá se compara contra espacios comunes. */
const plain = (s: string) => s.replace(/ /g, ' ')

const REVENUE: WeekRevenue = {
  income: 123_400_000,
  byMethod: [
    { method: 'transfer', total: 40_000_000 },
    { method: 'cash', total: 70_000_000 },
    { method: 'mercadopago', total: 13_400_000 },
  ],
  prevIncome: 110_000_000,
}

describe('weeklySummaryWeekStart', () => {
  it('on Monday returns the Monday of the week that just closed', () => {
    expect(weeklySummaryWeekStart('2026-10-19')).toBe('2026-10-12')
  })

  it('returns null every other day', () => {
    expect(weeklySummaryWeekStart('2026-10-18')).toBeNull() // domingo
    expect(weeklySummaryWeekStart('2026-10-20')).toBeNull() // martes
    expect(weeklySummaryWeekStart('2026-10-24')).toBeNull() // sábado
  })
})

describe('buildWeeklySummary', () => {
  it('formats the week total and tags the content as weekly', () => {
    const data = buildWeeklySummary('2026-10-12', REVENUE)
    expect(data.kind).toBe('weekly')
    expect(plain(data.totalArs)).toBe('$ 1.234.000')
  })

  it('lists cash, MercadoPago and transfer in the Métricas order, even at zero', () => {
    const data = buildWeeklySummary('2026-10-12', {
      ...REVENUE,
      byMethod: [{ method: 'cash', total: 70_000_000 }],
    })
    expect(data.methods.map((m) => ({ ...m, amountArs: plain(m.amountArs) }))).toEqual([
      { label: 'Efectivo', amountArs: '$ 700.000' },
      { label: 'MercadoPago', amountArs: '$ 0' },
      { label: 'Transferencia', amountArs: '$ 0' },
    ])
  })

  it('adds "Otro" only when something came in that way', () => {
    const without = buildWeeklySummary('2026-10-12', REVENUE)
    expect(without.methods.map((m) => m.label)).not.toContain('Otro')

    const withOther = buildWeeklySummary('2026-10-12', {
      ...REVENUE,
      byMethod: [...REVENUE.byMethod, { method: 'other', total: 500_000 }],
    })
    expect(withOther.methods.at(-1)?.label).toBe('Otro')
    expect(plain(withOther.methods.at(-1)?.amountArs ?? '')).toBe('$ 5.000')
  })

  it('compares against the previous week with a rounded percentage', () => {
    const data = buildWeeklySummary('2026-10-12', REVENUE)
    expect(
      data.comparison && { ...data.comparison, prevArs: plain(data.comparison.prevArs) },
    ).toEqual({
      direction: 'up',
      label: '12% vs la semana anterior',
      prevArs: '$ 1.100.000',
    })
  })

  it('marks a worse week as down', () => {
    const data = buildWeeklySummary('2026-10-12', { ...REVENUE, income: 88_000_000 })
    expect(data.comparison?.direction).toBe('down')
    expect(data.comparison?.label).toBe('20% vs la semana anterior')
  })

  it('has no comparison when the previous week had no income', () => {
    expect(buildWeeklySummary('2026-10-12', { ...REVENUE, prevIncome: 0 }).comparison).toBeNull()
  })

  it('labels a week inside one month', () => {
    expect(buildWeeklySummary('2026-10-12', REVENUE).weekLabel).toBe('lun 12 al dom 18 de octubre')
  })

  it('names both months when the week crosses one', () => {
    expect(buildWeeklySummary('2026-10-26', REVENUE).weekLabel).toBe(
      'lun 26 de octubre al dom 1 de noviembre',
    )
  })
})
