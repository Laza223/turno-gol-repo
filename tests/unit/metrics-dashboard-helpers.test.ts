import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  groupRevenue,
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

  it('reports up with positive delta in percentage points', () => {
    // 20% actual vs 10% previo → +10 pts.
    expect(noShowTrend(metric(2, 8), metric(1, 9))).toEqual({ kind: 'up', deltaPts: 10 })
  })

  it('reports down with negative delta', () => {
    expect(noShowTrend(metric(1, 9), metric(2, 8))).toEqual({ kind: 'down', deltaPts: -10 })
  })

  it('reports flat when rates match', () => {
    expect(noShowTrend(metric(1, 9), metric(2, 18))).toEqual({ kind: 'flat', deltaPts: 0 })
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
