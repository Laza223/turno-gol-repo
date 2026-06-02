import { describe, expect, it } from 'vitest'
import {
  addDaysUtc,
  computeNoShowRate,
  fillDailySeries,
  metricsWindow,
  METRICS_WINDOW_DAYS,
} from '@/modules/metrics/metrics.service'

describe('addDaysUtc', () => {
  it('adds and subtracts days', () => {
    expect(addDaysUtc('2026-06-01', 1)).toBe('2026-06-02')
    expect(addDaysUtc('2026-06-01', -1)).toBe('2026-05-31')
    expect(addDaysUtc('2026-06-01', 0)).toBe('2026-06-01')
  })

  it('crosses month and year boundaries', () => {
    expect(addDaysUtc('2026-03-01', -1)).toBe('2026-02-28') // 2026 is not a leap year
    expect(addDaysUtc('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDaysUtc('2024-02-28', 1)).toBe('2024-02-29') // 2024 is a leap year
  })
})

describe('metricsWindow', () => {
  it('builds an inclusive N-day window ending today', () => {
    expect(metricsWindow('2026-06-01', 30)).toEqual({ from: '2026-05-03', to: '2026-06-01' })
  })

  it('a 1-day window is just today', () => {
    expect(metricsWindow('2026-06-01', 1)).toEqual({ from: '2026-06-01', to: '2026-06-01' })
  })
})

describe('computeNoShowRate', () => {
  it('is no_show / (completed + no_show)', () => {
    expect(computeNoShowRate(5, 15)).toBe(0.25)
    expect(computeNoShowRate(3, 0)).toBe(1)
    expect(computeNoShowRate(0, 10)).toBe(0)
  })

  it('is 0 when there are no finished bookings (no divide-by-zero)', () => {
    expect(computeNoShowRate(0, 0)).toBe(0)
  })
})

describe('fillDailySeries', () => {
  it('zero-fills missing days and sorts ascending', () => {
    const series = fillDailySeries([{ date: '2026-06-02', count: 4 }], '2026-06-01', '2026-06-03')
    expect(series).toEqual([
      { date: '2026-06-01', count: 0 },
      { date: '2026-06-02', count: 4 },
      { date: '2026-06-03', count: 0 },
    ])
  })

  it('returns one element when from === to', () => {
    expect(fillDailySeries([], '2026-06-01', '2026-06-01')).toEqual([
      { date: '2026-06-01', count: 0 },
    ])
  })

  it('produces exactly METRICS_WINDOW_DAYS entries for the default window', () => {
    const { from, to } = metricsWindow('2026-06-01', METRICS_WINDOW_DAYS)
    expect(fillDailySeries([], from, to)).toHaveLength(METRICS_WINDOW_DAYS)
  })

  it('ignores rows outside the window', () => {
    const series = fillDailySeries(
      [
        { date: '2026-05-30', count: 9 }, // before window
        { date: '2026-06-02', count: 2 },
      ],
      '2026-06-01',
      '2026-06-03',
    )
    expect(series.find((d) => d.date === '2026-05-30')).toBeUndefined()
    expect(series.find((d) => d.date === '2026-06-02')?.count).toBe(2)
  })
})
