import { describe, expect, it } from 'vitest'
import { computeDelta, formatMethodLabel, getWeekBounds } from './report.utils'

describe('computeDelta', () => {
  it('returns null when there is no comparable previous period', () => {
    expect(computeDelta(1000, 0)).toBeNull()
  })

  it('flags an increase as "up"', () => {
    expect(computeDelta(1200, 1000)).toEqual({ direction: 'up', label: '20% vs mes ant.' })
  })

  it('flags a decrease as "down" with an absolute percentage', () => {
    expect(computeDelta(800, 1000)).toEqual({ direction: 'down', label: '20% vs mes ant.' })
  })

  it('treats no change as "up" (0% is non-negative)', () => {
    expect(computeDelta(1000, 1000)).toEqual({ direction: 'up', label: '0% vs mes ant.' })
  })

  it('accepts a custom suffix', () => {
    expect(computeDelta(1200, 1000, 'vs ayer')).toEqual({ direction: 'up', label: '20% vs ayer' })
  })
})

describe('formatMethodLabel', () => {
  it('translates every payment method to es-AR (§8.1 — no anglicisms in UI)', () => {
    expect(formatMethodLabel('cash')).toBe('Efectivo')
    expect(formatMethodLabel('transfer')).toBe('Transferencia')
    expect(formatMethodLabel('mercadopago')).toBe('MercadoPago')
    expect(formatMethodLabel('other')).toBe('Otro')
  })
})

describe('getWeekBounds', () => {
  it('covers 7 operating days, starting at ART midnight', () => {
    expect(getWeekBounds('2026-10-12')).toEqual({
      fromDate: '2026-10-12',
      toDate: '2026-10-19',
      fromUtc: new Date('2026-10-12T03:00:00.000Z'),
      toUtc: new Date('2026-10-19T03:00:00.000Z'),
    })
  })

  it('moves both ends by the night cutoff (complex that closes at 02:00)', () => {
    const b = getWeekBounds('2026-10-12', 120)
    expect(b.fromUtc).toEqual(new Date('2026-10-12T05:00:00.000Z'))
    expect(b.toUtc).toEqual(new Date('2026-10-19T05:00:00.000Z'))
  })

  it('crosses a month boundary', () => {
    expect(getWeekBounds('2026-10-26').toDate).toBe('2026-11-02')
  })
})
