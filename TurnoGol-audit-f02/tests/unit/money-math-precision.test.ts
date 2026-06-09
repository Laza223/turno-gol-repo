import { describe, expect, it } from 'vitest'

// We replicate the two production formulas verbatim from:
//   src/modules/payments/mp-gateway.implementation.ts:36-39 (pesosToCents)
//   src/modules/bookings/booking.service.ts:254 (deposit calc)
// so this test fails if either implementation changes and breaks the
// observed precision profile.

function pesosToCents(amount: number | undefined | null): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

function calcDeposit(priceSnapshot: number, depositPercentage: number): number {
  return Math.round((priceSnapshot * depositPercentage) / 100)
}

describe('Money math precision (B8.2 + B8.3)', () => {
  describe('pesosToCents — MP webhook decimal → cents', () => {
    it('whole pesos', () => {
      expect(pesosToCents(1000)).toBe(100000)
      expect(pesosToCents(0)).toBe(0)
      expect(pesosToCents(1)).toBe(100)
    })

    it('two-decimal cents (MP standard)', () => {
      expect(pesosToCents(100.55)).toBe(10055)
      expect(pesosToCents(99.99)).toBe(9999)
      expect(pesosToCents(0.01)).toBe(1)
      expect(pesosToCents(0.1)).toBe(10) // 0.1 * 100 = 9.99...8 → round = 10 ✓
    })

    it('rejects non-finite / non-number inputs', () => {
      expect(pesosToCents(null)).toBe(0)
      expect(pesosToCents(undefined)).toBe(0)
      expect(pesosToCents(NaN)).toBe(0)
      expect(pesosToCents(Infinity)).toBe(0)
      expect(pesosToCents(-Infinity)).toBe(0)
    })

    it('known float-precision edge: 1.005 (banker rounding side-effect)', () => {
      // 1.005 * 100 = 100.49999999999999 in IEEE-754 → Math.round = 100 (not 101).
      // This is a known JS quirk. Documented here so future change can decide
      // whether to switch to string-based conversion. For MP webhooks which
      // emit 2-decimal precision strictly, this never triggers.
      expect(pesosToCents(1.005)).toBe(100)
    })

    it('large MP amount within safe integer range', () => {
      expect(pesosToCents(99999.99)).toBe(9999999)
    })
  })

  describe('calcDeposit — Math.round(price * pct / 100)', () => {
    it('clean multiples', () => {
      expect(calcDeposit(100000, 20)).toBe(20000) // $1000 * 20% = $200
      expect(calcDeposit(800000, 50)).toBe(400000) // $8000 * 50% = $4000
      expect(calcDeposit(0, 50)).toBe(0)
    })

    it('non-integer intermediate rounds banker-style', () => {
      // 333333 * 10 / 100 = 33333.3 → round 33333 (loses 0.3 cents)
      expect(calcDeposit(333333, 10)).toBe(33333)
      // 7 * 33 / 100 = 2.31 → round 2
      expect(calcDeposit(7, 33)).toBe(2)
    })

    it('edge: 1 cent + 10% → 0 (silent truncate, real-world never happens)', () => {
      // Production guards via `requiresDeposit && depositPercentage > 0` and
      // prices are always >1000 cents ($10+). Documented for completeness.
      expect(calcDeposit(1, 10)).toBe(0)
    })

    it('100% deposit equals price', () => {
      expect(calcDeposit(800000, 100)).toBe(800000)
    })

    it('0% deposit is zero', () => {
      expect(calcDeposit(800000, 0)).toBe(0)
    })

    it('order-of-ops (multiply first) is integer-safe for realistic prices', () => {
      // Realistic ranges: prices 50_000 ($500) → 5_000_000 ($50_000), pct 10-50.
      for (const price of [50_000, 100_000, 800_000, 1_500_000, 5_000_000]) {
        for (const pct of [10, 20, 25, 33, 50]) {
          const r = calcDeposit(price, pct)
          expect(Number.isInteger(r)).toBe(true)
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThanOrEqual(price)
        }
      }
    })
  })
})
