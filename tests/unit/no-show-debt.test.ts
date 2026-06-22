import { describe, expect, it } from 'vitest'
import { computeNoShowDebt } from '@/modules/bookings/booking.cancellation'

// Tarea #5: el no-show genera deuda = price_snapshot − seña capturada.
describe('computeNoShowDebt', () => {
  it('sin seña → deuda = precio completo', () => {
    expect(
      computeNoShowDebt({ priceSnapshot: 800_000, depositAmount: 0, depositStatus: 'not_required' }),
    ).toBe(800_000)
  })

  it('seña capturada → deuda = precio − seña', () => {
    expect(
      computeNoShowDebt({ priceSnapshot: 800_000, depositAmount: 240_000, depositStatus: 'captured' }),
    ).toBe(560_000)
  })

  it('seña no capturada (pending) → deuda = precio completo', () => {
    expect(
      computeNoShowDebt({ priceSnapshot: 800_000, depositAmount: 240_000, depositStatus: 'pending' }),
    ).toBe(800_000)
  })

  it('seña ≥ precio → deuda = 0 (nunca negativa)', () => {
    expect(
      computeNoShowDebt({ priceSnapshot: 200_000, depositAmount: 240_000, depositStatus: 'captured' }),
    ).toBe(0)
  })

  it('block sin precio → deuda 0', () => {
    expect(
      computeNoShowDebt({ priceSnapshot: 0, depositAmount: 0, depositStatus: 'not_required' }),
    ).toBe(0)
  })
})
