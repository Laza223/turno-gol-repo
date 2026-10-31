import { describe, expect, it } from 'vitest'
import { addDays, addMonths } from 'date-fns'

// TurnoGol Plus en el monto del débito (decisión 2026-10-22, P3/P6/P7/P10).
// Los montos esperados están escritos a mano a propósito, no derivados de la
// fórmula: plan $30.000 por cancha, Plus de lista $15.000 por cancha.

import {
  annualMonthlyEquivalent,
  assertPlusSpecialPrice,
  buildPriceBreakdown,
  computeSubscriptionAmount,
  effectivePlusPerCourtCents,
  InvalidBilledCourtsError,
  InvalidPlusPriceError,
  monthlyListAmount,
  PLUS_LIST_PER_COURT_CENTS,
  plusProrateQuote,
} from '@/modules/billing/pricing'

const PLAN = {
  priceFirstCourtCents: 3_000_000,
  priceExtraCourtCents: 3_000_000,
  annualDiscountBps: 1_000,
}

describe('PR1 — Plus en el monto del débito', () => {
  it('5 canchas mensual: lista $225.000, especial $12.000 => $210.000', () => {
    expect(PLUS_LIST_PER_COURT_CENTS).toBe(1_500_000)
    expect(
      computeSubscriptionAmount({
        billedCourts: 5,
        cycle: 'monthly',
        plusPerCourtCents: 1_500_000,
        ...PLAN,
      }),
    ).toBe(22_500_000)
    expect(
      computeSubscriptionAmount({
        billedCourts: 5,
        cycle: 'monthly',
        plusPerCourtCents: 1_200_000,
        ...PLAN,
      }),
    ).toBe(21_000_000)
  })

  it('sin Plus el monto es idéntico al del plan solo, para 1..20 canchas x ciclo', () => {
    for (let courts = 1; courts <= 20; courts++) {
      expect(
        computeSubscriptionAmount({
          billedCourts: courts,
          cycle: 'monthly',
          plusPerCourtCents: 0,
          ...PLAN,
        }),
        `${courts} mensual`,
      ).toBe(monthlyListAmount(courts, PLAN))
      expect(
        computeSubscriptionAmount({
          billedCourts: courts,
          cycle: 'annual',
          plusPerCourtCents: 0,
          ...PLAN,
        }),
        `${courts} anual`,
      ).toBe(annualMonthlyEquivalent(courts, PLAN) * 12)
    }
    // Y el valor concreto: 5 canchas sin Plus = $150.000 el mes (lista de hoy).
    expect(
      computeSubscriptionAmount({
        billedCourts: 5,
        cycle: 'monthly',
        plusPerCourtCents: 0,
        ...PLAN,
      }),
    ).toBe(15_000_000)
  })
})

describe('PR2 — el descuento anual va sobre la SUMA plan + Plus', () => {
  it('Plus especial $12.000, 5 canchas, anual: ($150.000 + $60.000) x 0,9 x 12 = $2.268.000', () => {
    expect(
      computeSubscriptionAmount({
        billedCourts: 5,
        cycle: 'annual',
        plusPerCourtCents: 1_200_000,
        ...PLAN,
      }),
    ).toBe(226_800_000)
    // chargePerCycleCents (lo que ve el dueño) coincide con lo que se manda a MP.
    expect(
      buildPriceBreakdown({
        billedCourts: 5,
        cycle: 'annual',
        plusPerCourtCents: 1_200_000,
        ...PLAN,
      }).chargePerCycleCents,
    ).toBe(226_800_000)
  })
})

describe('PR3 — precio impar: enteros y sin divergencia con la cotización', () => {
  it('123.455 c/cancha, 3 canchas, anual: entero, y 12 meses de cotización == el Plus del débito anual', () => {
    const plusPerCourtCents = 123_455
    const withPlus = computeSubscriptionAmount({
      billedCourts: 3,
      cycle: 'annual',
      plusPerCourtCents,
      ...PLAN,
    })
    const withoutPlus = computeSubscriptionAmount({
      billedCourts: 3,
      cycle: 'annual',
      plusPerCourtCents: 0,
      ...PLAN,
    })
    expect(Number.isInteger(withPlus)).toBe(true)
    // (9.000.000 + 370.365) = 9.370.365 x 0,9 = 8.433.328,5 -> 8.433.329 (x12)
    expect(withPlus).toBe(8_433_329 * 12)
    const periodEnd = addMonths(new Date('2026-03-10T12:00:00Z'), 12)
    const quote = plusProrateQuote({
      now: new Date('2026-03-10T12:00:00Z'),
      periodEnd,
      billedCourts: 3,
      plusPerCourtCents,
      annualDiscountBps: 1_000,
    })
    expect(quote.months).toBe(12)
    expect(quote.amountCents).toBe(withPlus - withoutPlus)
  })
})

describe('PR4 — precio especial (P10)', () => {
  it('NULL => lista; prendido con especial => el especial', () => {
    expect(effectivePlusPerCourtCents(true, null)).toBe(1_500_000)
    expect(effectivePlusPerCourtCents(true, 1_200_000)).toBe(1_200_000)
  })

  it('Plus apagado => 0, aunque haya un especial guardado', () => {
    expect(effectivePlusPerCourtCents(false, null)).toBe(0)
    expect(effectivePlusPerCourtCents(false, 1_500_000)).toBe(0)
  })

  it.each([0, -1, -2_000_000, 1.5, NaN, Infinity])(
    'especial %s => InvalidPlusPriceError, no cae a la lista',
    (bad) => {
      expect(() => assertPlusSpecialPrice(bad)).toThrow(InvalidPlusPriceError)
      expect(() => effectivePlusPerCourtCents(true, bad)).toThrow(InvalidPlusPriceError)
      expect(() => effectivePlusPerCourtCents(false, bad)).toThrow(InvalidPlusPriceError)
    },
  )

  it('computeSubscriptionAmount rechaza un Plus por cancha negativo o fraccionario', () => {
    for (const plusPerCourtCents of [-1, 0.5]) {
      expect(() =>
        computeSubscriptionAmount({
          billedCourts: 2,
          cycle: 'monthly',
          plusPerCourtCents,
          ...PLAN,
        }),
      ).toThrow(InvalidPlusPriceError)
    }
  })
})

describe('PR5 — cotización del alta de Plus en un anual (P7)', () => {
  const now = new Date('2026-03-10T12:00:00Z')
  const quote = (periodEnd: Date, billedCourts = 5, plusPerCourtCents = 1_500_000) =>
    plusProrateQuote({ now, periodEnd, billedCourts, plusPerCourtCents, annualDiscountBps: 1_000 })

  it('5 meses y 12 días, 5 canchas, Plus $15.000 => 5 meses y $337.500', () => {
    expect(quote(addDays(addMonths(now, 5), 12))).toEqual({ months: 5, amountCents: 33_750_000 })
  })

  it('bordes: 29 días => 0 meses; 1 mes exacto => 1; 11 meses y 25 días => 11; más de un año => 12', () => {
    expect(quote(addDays(now, 29))).toEqual({ months: 0, amountCents: 0 })
    expect(quote(addMonths(now, 1)).months).toBe(1)
    expect(quote(addDays(addMonths(now, 11), 25)).months).toBe(11)
    expect(quote(addDays(addMonths(now, 12), 20)).months).toBe(12)
  })

  it('una cotización que no entra en la columna integer tira InvalidPlusPriceError (no un error de DB)', () => {
    // 12 meses × 10 canchas × $200.000 con 10% off = 2.160.000.000 > 2^31 − 1.
    expect(() => quote(addMonths(now, 13), 10, 20_000_000)).toThrow(InvalidPlusPriceError)
    // El borde de abajo sigue cotizando.
    expect(quote(addMonths(now, 13), 10, 1_500_000)).toEqual({
      months: 12,
      amountCents: 162_000_000,
    })
  })

  it('un período ya vencido no cotiza (0 meses, 0 centavos)', () => {
    expect(quote(addDays(now, -3))).toEqual({ months: 0, amountCents: 0 })
  })

  it('aritmética de calendario: 31/ene => 28/feb es un mes completo', () => {
    const jan31 = new Date('2027-01-31T12:00:00Z')
    const feb28 = new Date('2027-02-28T12:00:00Z')
    expect(
      plusProrateQuote({
        now: jan31,
        periodEnd: feb28,
        billedCourts: 5,
        plusPerCourtCents: 1_500_000,
        annualDiscountBps: 1_000,
      }).months,
    ).toBe(1)
  })

  it('manda billed_courts: más canchas facturadas, más caro', () => {
    expect(quote(addMonths(now, 2), 2).amountCents).toBe(2 * 2 * 1_350_000)
    expect(quote(addMonths(now, 2), 8).amountCents).toBe(2 * 8 * 1_350_000)
  })

  it('canchas inválidas explotan', () => {
    expect(() => quote(addMonths(now, 2), 0)).toThrow(InvalidBilledCourtsError)
  })
})

describe('PR6 — el desglose y el cobro no divergen', () => {
  it('mensual con Plus: plan + Plus == lista == lo que se cobra', () => {
    const b = buildPriceBreakdown({
      billedCourts: 5,
      cycle: 'monthly',
      plusPerCourtCents: 2_000_000,
      ...PLAN,
    })
    expect(b.planMonthlyListCents).toBe(15_000_000)
    expect(b.plusPerCourtCents).toBe(2_000_000)
    expect(b.plusMonthlyListCents).toBe(10_000_000)
    expect(b.firstCourtCents + b.extraCourtsTotalCents + b.plusMonthlyListCents).toBe(
      b.monthlyListCents,
    )
    expect(b.monthlyListCents).toBe(25_000_000)
    expect(b.monthlyEffectiveCents).toBe(25_000_000)
    expect(b.chargePerCycleCents).toBe(25_000_000)
    expect(b.annualSavingsCents).toBe(0)
  })

  it('anual con Plus: equivalente mensual con 10% sobre la suma, cobro x12, ahorro del año', () => {
    const b = buildPriceBreakdown({
      billedCourts: 5,
      cycle: 'annual',
      plusPerCourtCents: 2_000_000,
      ...PLAN,
    })
    expect(b.monthlyListCents).toBe(25_000_000)
    expect(b.monthlyEffectiveCents).toBe(22_500_000)
    expect(b.chargePerCycleCents).toBe(22_500_000 * 12)
    expect(b.annualSavingsCents).toBe(2_500_000 * 12)
  })

  it('sin Plus la línea de Plus es cero y el total es el del plan', () => {
    const b = buildPriceBreakdown({
      billedCourts: 5,
      cycle: 'monthly',
      plusPerCourtCents: 0,
      ...PLAN,
    })
    expect(b.plusMonthlyListCents).toBe(0)
    expect(b.monthlyListCents).toBe(b.planMonthlyListCents)
  })
})
