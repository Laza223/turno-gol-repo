import { describe, expect, it } from 'vitest'
import {
  addDaysUtc,
  computeNoShowRate,
  fillDailySeries,
  metricsWindow,
  previousWindow,
  rankTopSlots,
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

describe('previousWindow', () => {
  it('returns the same-length window ending the day before from', () => {
    expect(previousWindow({ from: '2026-05-03', to: '2026-06-01' }, 30)).toEqual({
      from: '2026-04-03',
      to: '2026-05-02',
    })
  })

  it('chains with metricsWindow so windows are contiguous and non-overlapping', () => {
    const current = metricsWindow('2026-06-01', METRICS_WINDOW_DAYS)
    const prev = previousWindow(current, METRICS_WINDOW_DAYS)
    expect(addDaysUtc(prev.to, 1)).toBe(current.from)
    expect(fillDailySeries([], prev.from, prev.to)).toHaveLength(METRICS_WINDOW_DAYS)
  })

  it('crosses year boundaries', () => {
    expect(previousWindow({ from: '2026-01-10', to: '2026-01-16' }, 7)).toEqual({
      from: '2026-01-03',
      to: '2026-01-09',
    })
  })
})

describe('rankTopSlots', () => {
  it('sorts by count desc and keeps the top 5', () => {
    const rows = [
      { time: '18:00:00', count: 3 },
      { time: '20:00:00', count: 9 },
      { time: '21:00:00', count: 7 },
      { time: '19:00:00', count: 5 },
      { time: '17:00:00', count: 4 },
      { time: '10:00:00', count: 1 },
    ]
    const top = rankTopSlots(rows)
    expect(top).toHaveLength(5)
    expect(top[0]).toEqual({ time: '20:00', count: 9 })
    expect(top.map((s) => s.time)).not.toContain('10:00')
  })

  it('normalizes HH:MM:SS to HH:MM and breaks count-ties by earlier time', () => {
    const top = rankTopSlots([
      { time: '21:30:00', count: 2 },
      { time: '09:00:00', count: 2 },
    ])
    expect(top).toEqual([
      { time: '09:00', count: 2 },
      { time: '21:30', count: 2 },
    ])
  })

  it('returns an empty list for no rows and does not mutate the input', () => {
    expect(rankTopSlots([])).toEqual([])
    const rows = [
      { time: '20:00:00', count: 1 },
      { time: '19:00:00', count: 8 },
    ]
    rankTopSlots(rows)
    expect(rows[0].time).toBe('20:00:00')
  })
})
