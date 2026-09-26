import { describe, expect, it } from 'vitest'
import { MIN_FINISHED_FOR_TREND, noShowTrend } from '@/app/(admin)/analiticas/dashboard-helpers'
// `relativeTimeEs` se mudó a `@/lib/format` cuando "Necesita tu atención"
// (en `src/components/`) pasó a pintar el `since` de cada alerta.
import { relativeTimeEs } from '@/lib/format'
import type { NoShowMetric } from '@/modules/metrics/metrics.service'

function metric(noShow: number, completed: number): NoShowMetric {
  const finished = noShow + completed
  return { noShow, completed, finished, rate: finished === 0 ? 0 : noShow / finished }
}

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
