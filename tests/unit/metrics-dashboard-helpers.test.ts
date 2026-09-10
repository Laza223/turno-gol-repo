import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  groupRevenue,
  MIN_FINISHED_FOR_TREND,
  mondayOf,
  noShowTrend,
  relativeTimeEs,
} from '@/app/(admin)/analiticas/dashboard-helpers'
import type { NoShowMetric } from '@/modules/metrics/metrics.service'

function metric(noShow: number, completed: number): NoShowMetric {
  const finished = noShow + completed
  return { noShow, completed, finished, rate: finished === 0 ? 0 : noShow / finished }
}

describe('dayLabel', () => {
  it('formats YYYY-MM-DD as dd/MM without TZ drift', () => {
    expect(dayLabel('2026-06-01')).toBe('01/06')
    expect(dayLabel('2026-12-31')).toBe('31/12')
  })
})

describe('mondayOf', () => {
  it('maps every day of the week to its Monday (weeks Mon-Sun)', () => {
    // 2026-06-08 es lunes.
    expect(mondayOf('2026-06-08')).toBe('2026-06-08')
    expect(mondayOf('2026-06-10')).toBe('2026-06-08') // miércoles
    expect(mondayOf('2026-06-14')).toBe('2026-06-08') // domingo cierra la semana
    expect(mondayOf('2026-06-15')).toBe('2026-06-15') // lunes siguiente
  })

  it('crosses month boundaries', () => {
    // 2026-06-01 es lunes; 2026-05-31 (domingo) pertenece a la semana del 25/05.
    expect(mondayOf('2026-05-31')).toBe('2026-05-25')
  })
})

describe('groupRevenue', () => {
  const series = [
    { date: '2026-05-30', amountCents: 100 }, // sábado, semana del 25/05, mayo
    { date: '2026-05-31', amountCents: 200 }, // domingo, misma semana, mayo
    { date: '2026-06-01', amountCents: 300 }, // lunes, semana del 01/06, junio
    { date: '2026-06-02', amountCents: 400 }, // martes, misma semana, junio
  ]

  it('day mode maps 1:1 with dd/MM labels', () => {
    expect(groupRevenue(series, 'day')).toEqual([
      { label: '30/05', amountCents: 100 },
      { label: '31/05', amountCents: 200 },
      { label: '01/06', amountCents: 300 },
      { label: '02/06', amountCents: 400 },
    ])
  })

  it('week mode sums Mon-Sun buckets labeled by their Monday', () => {
    expect(groupRevenue(series, 'week')).toEqual([
      { label: 'Sem 25/05', amountCents: 300 },
      { label: 'Sem 01/06', amountCents: 700 },
    ])
  })

  it('month mode sums per calendar month in chronological order', () => {
    const months = groupRevenue(series, 'month')
    expect(months).toHaveLength(2)
    expect(months[0].amountCents).toBe(300) // mayo
    expect(months[1].amountCents).toBe(700) // junio
    expect(months[0].label.toLowerCase()).toContain('may')
    expect(months[1].label.toLowerCase()).toContain('jun')
  })

  it('handles an empty series', () => {
    expect(groupRevenue([], 'week')).toEqual([])
  })
})

describe('noShowTrend', () => {
  it('reports no_prev when the previous window has no finished bookings', () => {
    expect(noShowTrend(metric(2, 8), metric(0, 0))).toEqual({ kind: 'no_prev' })
  })

  // H174: por debajo de MIN_FINISHED_FOR_TREND en cualquiera de las dos
  // ventanas, la comparación se oculta — sin importar cuán parejas o dispares
  // sean las tasas.
  const below = MIN_FINISHED_FOR_TREND - 1
  const above = MIN_FINISHED_FOR_TREND + 20

  it('reports low_sample when the current window is below the trend floor', () => {
    expect(noShowTrend(metric(4, below - 4), metric(5, above - 5))).toEqual({
      kind: 'low_sample',
    })
  })

  it('reports low_sample when the previous window is below the trend floor', () => {
    expect(noShowTrend(metric(5, above - 5), metric(4, below - 4))).toEqual({
      kind: 'low_sample',
    })
  })

  it('reports low_sample right at the floor minus one, and a real trend right at the floor', () => {
    expect(noShowTrend(metric(2, below - 2), metric(2, below - 2))).toEqual({
      kind: 'low_sample',
    })
    expect(
      noShowTrend(metric(2, MIN_FINISHED_FOR_TREND - 2), metric(2, MIN_FINISHED_FOR_TREND - 2)),
    ).toEqual({ kind: 'flat', deltaPts: 0 })
  })

  it('reports up with positive delta in percentage points', () => {
    // 20% actual vs 10% previo, ambas ventanas por encima del piso → +10 pts.
    expect(noShowTrend(metric(20, 80), metric(10, 90))).toEqual({ kind: 'up', deltaPts: 10 })
  })

  it('reports down with negative delta', () => {
    expect(noShowTrend(metric(10, 90), metric(20, 80))).toEqual({ kind: 'down', deltaPts: -10 })
  })

  it('reports flat when rates match', () => {
    expect(noShowTrend(metric(10, 90), metric(20, 180))).toEqual({ kind: 'flat', deltaPts: 0 })
  })
})

describe('relativeTimeEs', () => {
  const now = Date.parse('2026-06-12T12:00:00Z')

  it('says recién under a minute (and for future timestamps)', () => {
    expect(relativeTimeEs('2026-06-12T11:59:30Z', now)).toBe('recién')
    expect(relativeTimeEs('2026-06-12T12:05:00Z', now)).toBe('recién')
  })

  it('uses minutes, hours and days', () => {
    expect(relativeTimeEs('2026-06-12T11:57:00Z', now)).toBe('hace 3 min')
    expect(relativeTimeEs('2026-06-12T10:00:00Z', now)).toBe('hace 2 h')
    expect(relativeTimeEs('2026-06-11T11:00:00Z', now)).toBe('hace 1 día')
    expect(relativeTimeEs('2026-06-09T12:00:00Z', now)).toBe('hace 3 días')
  })
})
