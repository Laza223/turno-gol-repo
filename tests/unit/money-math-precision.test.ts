import { describe, expect, it } from 'vitest'
import { centsToPesos, pesosToCents } from '@/modules/payments/money'
import { calcDepositCents } from '@/modules/bookings/deposit'

// These tests import the REAL production converters. If either formula changes,
// these tests break — which is the whole point. (The previous version of this
// file re-declared local copies of the formulas, so it could never have caught
// a production regression: it only tested its own copy.)
//
// Coverage map (the production sites these guard):
//   pesosToCents   — src/modules/payments/mp-gateway.implementation.ts (MP webhook
//                    decimal `transaction_amount` → integer cents). NOT covered by
//                    integration tests, which use MockGateway and bypass it.
//   centsToPesos   — same file; integer cents → decimal pesos for OUTBOUND MP calls
//                    (preference unit_price, refund amount). Also bypassed by mocks.
//   calcDepositCents — src/modules/bookings/booking.service.ts deposit calc. Integration
//                    `bookings.test.ts` covers ONE happy path (800000 * 30% = 240000);
//                    these add the rounding / boundary / invariant edge cases.

describe('Money math precision (B8.2 + B8.3)', () => {
  describe('pesosToCents — MP webhook decimal pesos → integer cents', () => {
    it('converts whole pesos to cents', () => {
      expect(pesosToCents(1000)).toBe(100000)
      expect(pesosToCents(0)).toBe(0)
      expect(pesosToCents(1)).toBe(100)
    })

    it('converts two-decimal amounts (MP standard payload) exactly', () => {
      expect(pesosToCents(100.55)).toBe(10055)
      expect(pesosToCents(99.99)).toBe(9999)
      expect(pesosToCents(0.01)).toBe(1)
      expect(pesosToCents(0.1)).toBe(10) // 0.1*100 = 9.999...8 → round → 10
    })

    it('returns 0 for non-finite or non-number input (defensive guard)', () => {
      expect(pesosToCents(null)).toBe(0)
      expect(pesosToCents(undefined)).toBe(0)
      expect(pesosToCents(NaN)).toBe(0)
      expect(pesosToCents(Infinity)).toBe(0)
      expect(pesosToCents(-Infinity)).toBe(0)
      // typeof guard: a numeric STRING must not slip through as a real amount.
      expect(pesosToCents('100' as unknown as number)).toBe(0)
    })

    it('does NOT clamp negative amounts — converts sign-preserving', () => {
      // The guard only rejects non-finite/non-number; negatives pass through.
      // Pinned so a future "clamp to >= 0" change is a deliberate, visible decision.
      expect(pesosToCents(-100.55)).toBe(-10055)
      expect(pesosToCents(-1)).toBe(-100)
    })

    it('documents the IEEE-754 half-cent quirk: 1.005 → 100, not 101', () => {
      // 1.005 * 100 === 100.49999999999999 in IEEE-754, which is < 100.5, so
      // Math.round → 100. NOT a rounding-mode choice — the binary product is
      // genuinely below the tie. MP emits strict 2-decimal amounts, so this
      // sub-cent input never reaches production; documented for the day someone
      // proposes string-based conversion.
      expect(pesosToCents(1.005)).toBe(100)
    })

    it('handles large MP amounts within the safe-integer range', () => {
      expect(pesosToCents(99999.99)).toBe(9999999)
    })
  })

  describe('centsToPesos — integer cents → decimal pesos for outbound MP', () => {
    it('converts cents back to decimal pesos', () => {
      expect(centsToPesos(240000)).toBe(2400)
      expect(centsToPesos(10055)).toBe(100.55)
      expect(centsToPesos(9999)).toBe(99.99)
      expect(centsToPesos(1)).toBe(0.01)
      expect(centsToPesos(0)).toBe(0)
    })

    it('rounds non-integer cents before dividing (defensive)', () => {
      // Production amounts are integer cents, but the guard rounds first so a
      // stray float can never emit a >2-decimal price to MP.
      expect(centsToPesos(2400.6)).toBe(24.01)
      expect(centsToPesos(2400.4)).toBe(24)
    })

    it('round-trips cents → pesos → cents without loss for realistic amounts', () => {
      // This is the invariant that actually matters in prod: a deposit stored in
      // cents, sent to MP as pesos, then read back from the webhook must equal
      // the original cents. Covers the full conversion pair end to end.
      for (const cents of [1, 99, 100, 9999, 10055, 240000, 800000, 9999999]) {
        expect(pesosToCents(centsToPesos(cents))).toBe(cents)
      }
    })
  })

  describe('calcDepositCents — Math.round(priceCents * pct / 100)', () => {
    it('matches the deposit the integration suite asserts (regression anchor)', () => {
      // tests/integration/bookings.test.ts asserts depositAmount === 240000 for
      // an 800000-cent price at 30%. Pin the same value to the pure function so
      // unit and integration cannot silently diverge.
      expect(calcDepositCents(800000, 30)).toBe(240000)
    })

    it('computes clean multiples exactly', () => {
      expect(calcDepositCents(100000, 20)).toBe(20000) // $1000 * 20% = $200
      expect(calcDepositCents(800000, 50)).toBe(400000) // $8000 * 50% = $4000
      expect(calcDepositCents(0, 50)).toBe(0)
    })

    it('100% deposit equals the full price', () => {
      expect(calcDepositCents(800000, 100)).toBe(800000)
    })

    it('0% deposit is zero', () => {
      expect(calcDepositCents(800000, 0)).toBe(0)
    })

    it('rounds non-integer intermediates to the nearest cent', () => {
      expect(calcDepositCents(333333, 10)).toBe(33333) // 33333.3 → 33333
      expect(calcDepositCents(7, 33)).toBe(2) // 2.31 → 2
    })

    it('uses round-half-UP (NOT banker rounding) on exact half-cent ties', () => {
      // JS Math.round breaks ties toward +∞: Math.round(0.5)=1, Math.round(2.5)=3.
      // Banker's rounding (round-half-even) would give 0 and 2. These inputs
      // produce EXACT .5 products (0.5 and 2.5 are representable), so they prove
      // the rounding mode unambiguously.
      expect(calcDepositCents(50, 1)).toBe(1) // 0.5 → 1 (banker's would give 0)
      expect(calcDepositCents(250, 1)).toBe(3) // 2.5 → 3 (banker's would give 2)
    })

    it('truncates a sub-cent deposit to 0 (guarded in prod by price/pct minimums)', () => {
      // Production gates this via `requiresDeposit && depositPercentage > 0` and
      // real prices are >1000 cents, so this never fires. Pinned for completeness.
      expect(calcDepositCents(1, 10)).toBe(0)
    })

    it('always returns a non-negative integer no greater than the price', () => {
      // Invariant across the realistic price × percentage grid.
      for (const price of [50_000, 100_000, 800_000, 1_500_000, 5_000_000]) {
        for (const pct of [10, 20, 25, 33, 50, 100]) {
          const r = calcDepositCents(price, pct)
          expect(Number.isInteger(r)).toBe(true)
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThanOrEqual(price)
        }
      }
    })
  })
})
