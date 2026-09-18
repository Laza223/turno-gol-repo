import { describe, expect, it } from 'vitest'

// Precio LINEAL POR CANCHA (decisión 2026-09-17, supera a D3):
// $47.000 la primera cancha + $30.000 por cada extra, por mes, sin techo.
// Anual: 10% off.
//
// Los montos esperados de este archivo están escritos a mano A PROPÓSITO, NO
// derivados de la fórmula: si el test recalculara con la misma fórmula que el
// código, no probaría nada. Cada número de acá sale de la tabla de la decisión
// y del board §8.3.

import {
  annualMonthlyEquivalent,
  buildPriceBreakdown,
  computeSubscriptionAmount,
  InvalidBilledCourtsError,
  monthlyListAmount,
} from '@/modules/billing/pricing'

const PARAMS = {
  priceFirstCourtCents: 4_700_000, // $47.000
  priceExtraCourtCents: 3_000_000, // $30.000
  annualDiscountBps: 1_000, // 10%
}

describe('monthlyListAmount — la cuota mensual de lista', () => {
  it.each([
    [1, 4_700_000], // $47.000
    [2, 7_700_000], // $77.000
    [3, 10_700_000], // $107.000
    [4, 13_700_000], // $137.000
    [5, 16_700_000], // $167.000  ← el complejo en prueba
    [6, 19_700_000], // $197.000
    [8, 25_700_000], // $257.000
    [20, 61_700_000], // $617.000 — sin techo: la regla no se corta nunca
  ])('%i cancha(s) => %i centavos', (courts, expected) => {
    expect(monthlyListAmount(courts, PARAMS)).toBe(expected)
  })
})

describe('annualMonthlyEquivalent — equivalente mensual pagando el año', () => {
  it.each([
    [1, 4_230_000], // $42.300 = $47.000 − 10%
    [5, 15_030_000], // $150.300 = $167.000 − 10%
    [6, 17_730_000], // $177.300
  ])('%i cancha(s) => %i centavos', (courts, expected) => {
    expect(annualMonthlyEquivalent(courts, PARAMS)).toBe(expected)
  })

  it('con descuento 0 devuelve exactamente la cuota de lista', () => {
    expect(annualMonthlyEquivalent(5, { ...PARAMS, annualDiscountBps: 0 })).toBe(16_700_000)
  })
})

describe('computeSubscriptionAmount — lo que se le manda a MercadoPago', () => {
  it('ciclo mensual: manda la cuota del mes', () => {
    expect(computeSubscriptionAmount({ billedCourts: 5, cycle: 'monthly', ...PARAMS })).toBe(
      16_700_000,
    )
  })

  // La trampa que ya había documentado planAmount(): el preapproval anual
  // cobra UNA vez por año. Mandar el equivalente mensual a pelo le cobra al
  // complejo 12 veces menos de lo que corresponde.
  it('ciclo anual: manda el equivalente mensual POR 12, no el equivalente mensual', () => {
    const anual = computeSubscriptionAmount({ billedCourts: 5, cycle: 'annual', ...PARAMS })
    expect(anual).toBe(15_030_000 * 12) // $1.803.600 al año
    expect(anual).not.toBe(15_030_000)
  })

  it('el anual sale 10% más barato que 12 meses sueltos', () => {
    const doceMesesSueltos = computeSubscriptionAmount({
      billedCourts: 5,
      cycle: 'monthly',
      ...PARAMS,
    })
    const unAnio = computeSubscriptionAmount({ billedCourts: 5, cycle: 'annual', ...PARAMS })
    expect(unAnio).toBe(Math.round(doceMesesSueltos * 12 * 0.9))
  })
})

describe('bordes — tienen que explotar, no devolver un número raro', () => {
  it.each([0, -1, -5])('%i canchas tira InvalidBilledCourtsError', (courts) => {
    expect(() => monthlyListAmount(courts, PARAMS)).toThrow(InvalidBilledCourtsError)
  })

  it.each([1.5, NaN, Infinity])('%s canchas tira InvalidBilledCourtsError', (courts) => {
    expect(() => monthlyListAmount(courts, PARAMS)).toThrow(InvalidBilledCourtsError)
  })

  it('computeSubscriptionAmount propaga el error, no devuelve NaN', () => {
    expect(() =>
      computeSubscriptionAmount({ billedCourts: 0, cycle: 'monthly', ...PARAMS }),
    ).toThrow(InvalidBilledCourtsError)
  })
})

describe('buildPriceBreakdown — lo que ve el dueño en pantalla', () => {
  it('desglosa 5 canchas mensual', () => {
    expect(buildPriceBreakdown({ billedCourts: 5, cycle: 'monthly', ...PARAMS })).toEqual({
      billedCourts: 5,
      firstCourtCents: 4_700_000,
      extraCourts: 4,
      extraCourtUnitCents: 3_000_000,
      extraCourtsTotalCents: 12_000_000,
      monthlyListCents: 16_700_000,
      monthlyEffectiveCents: 16_700_000,
      chargePerCycleCents: 16_700_000,
      cycle: 'monthly',
      annualDiscountBps: 1_000,
      annualSavingsCents: 0,
    })
  })

  it('una sola cancha no muestra extras', () => {
    const b = buildPriceBreakdown({ billedCourts: 1, cycle: 'monthly', ...PARAMS })
    expect(b.extraCourts).toBe(0)
    expect(b.extraCourtsTotalCents).toBe(0)
    expect(b.monthlyListCents).toBe(4_700_000)
  })

  it('anual: la cuota efectiva baja y el ahorro del año es el 10%', () => {
    const b = buildPriceBreakdown({ billedCourts: 5, cycle: 'annual', ...PARAMS })
    expect(b.monthlyListCents).toBe(16_700_000)
    expect(b.monthlyEffectiveCents).toBe(15_030_000)
    expect(b.chargePerCycleCents).toBe(15_030_000 * 12)
    expect(b.annualSavingsCents).toBe(1_670_000 * 12) // $200.400 en el año
  })

  // El desglose y el cobro NO pueden divergir: es el mismo número por dos
  // caminos. Si alguien toca la fórmula y se olvida del desglose, esto rompe.
  it('el total del desglose es exactamente lo que se cobra en mensual', () => {
    for (const courts of [1, 2, 4, 5, 6, 8, 20]) {
      const b = buildPriceBreakdown({ billedCourts: courts, cycle: 'monthly', ...PARAMS })
      expect(b.firstCourtCents + b.extraCourtsTotalCents).toBe(b.chargePerCycleCents)
    }
  })
})
