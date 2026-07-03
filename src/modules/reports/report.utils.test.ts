import { describe, expect, it } from 'vitest'
import { computeDelta, formatMethodLabel } from './report.utils'

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
