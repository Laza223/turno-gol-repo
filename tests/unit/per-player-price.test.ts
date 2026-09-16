import { describe, expect, it } from 'vitest'
import {
  formatArs,
  perPlayerPriceCents,
  formatPerPlayerArs,
  roundPerPlayerCents,
} from '@/lib/format'

describe('perPlayerPriceCents', () => {
  it('returns null when fromPriceCents is null', () => {
    expect(perPlayerPriceCents(null, [7])).toBeNull()
  })

  it('returns null when fromPriceCents is undefined', () => {
    expect(perPlayerPriceCents(undefined, [5])).toBeNull()
  })

  it('returns null when formats array is empty', () => {
    expect(perPlayerPriceCents(6000000, [])).toBeNull()
  })

  it('calculates correctly for Fútbol 7 (14 players)', () => {
    // $60.000 = 6.000.000 centavos ÷ 14 jugadores = 428.571¢ → ceil to $4.300 = 430.000¢
    expect(perPlayerPriceCents(6000000, [7])).toBe(430000)
  })

  it('calculates correctly for Fútbol 5 (10 players)', () => {
    // $50.000 = 5.000.000 centavos ÷ 10 jugadores = 500.000¢ → $5.000 exactly
    expect(perPlayerPriceCents(5000000, [5])).toBe(500000)
  })

  it('uses the smallest format when multiple are present', () => {
    // Formats [5, 7, 11] → min is 5 → 10 players
    // $60.000 = 6.000.000 centavos ÷ 10 = 600.000¢ → $6.000
    expect(perPlayerPriceCents(6000000, [5, 7, 11])).toBe(600000)
  })

  it('rounds up to the nearest $100 (10.000 centavos)', () => {
    // $45.000 = 4.500.000 centavos ÷ 14 (F7) = 321.428¢ → ceil to $3.300 = 330.000¢
    expect(perPlayerPriceCents(4500000, [7])).toBe(330000)
  })

  it('handles Fútbol 11 (22 players)', () => {
    // $100.000 = 10.000.000 centavos ÷ 22 = 454.545¢ → ceil to $4.600 = 460.000¢
    expect(perPlayerPriceCents(10000000, [11])).toBe(460000)
  })

  it('handles exact multiples without rounding up', () => {
    // $70.000 = 7.000.000 centavos ÷ 10 (F5) = 700.000¢ → $7.000 exact
    expect(perPlayerPriceCents(7000000, [5])).toBe(700000)
  })
})

describe('roundPerPlayerCents', () => {
  it('redondea hacia arriba a la centena de pesos', () => {
    expect(roundPerPlayerCents(428572)).toBe(430000)
    expect(roundPerPlayerCents(500000)).toBe(500000)
  })

  it('es monótona: da lo mismo redondear antes o después del mínimo', () => {
    // Por eso la columna denormalizada (migr. 087) guarda el mínimo CRUDO.
    const crudos = [428572, 450000, 363637]
    const minLuegoRedondeo = roundPerPlayerCents(Math.min(...crudos))
    const redondeoLuegoMin = Math.min(...crudos.map(roundPerPlayerCents))
    expect(minLuegoRedondeo).toBe(redondeoLuegoMin)
  })
})

describe('formatPerPlayerArs', () => {
  it('returns null when there is no per-player price', () => {
    expect(formatPerPlayerArs(null)).toBeNull()
    expect(formatPerPlayerArs(undefined)).toBeNull()
  })

  it('formatea el mínimo crudo ya redondeado a $100', () => {
    // 428.572¢ = $4.285,72 → $4.300
    expect(formatPerPlayerArs(428572)).toBe(formatArs(430000))
  })
})
