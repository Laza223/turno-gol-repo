import { describe, expect, it } from 'vitest'
import { getCancellationPreview } from '@/modules/bookings/cancellation-preview'

/**
 * ENS-2: consecuencia concreta de cancelar ESTE booking AHORA. Reusa
 * `decideAdminRefund` (booking.cancellation.ts) con cancellationType='jugador'
 * — la misma política que aplica `cancelByPlayer` — para no inventar un
 * umbral nuevo.
 */
describe('getCancellationPreview (ENS-2)', () => {
  const HOUR = 3_600_000

  it('sin seña paga → no_deposit', () => {
    const preview = getCancellationPreview({
      depositStatus: 'not_required',
      depositAmountCents: 0,
      bookingStartUtcMs: Date.UTC(2026, 6, 20, 12, 0, 0),
      policyHours: 12,
      nowMs: Date.UTC(2026, 6, 14, 12, 0, 0),
    })
    expect(preview).toEqual({ kind: 'no_deposit' })
  })

  it('deposit_amount 0 aunque diga paid → no_deposit (defensivo)', () => {
    const preview = getCancellationPreview({
      depositStatus: 'paid',
      depositAmountCents: 0,
      bookingStartUtcMs: Date.UTC(2026, 6, 20, 12, 0, 0),
      policyHours: 12,
      nowMs: Date.UTC(2026, 6, 14, 12, 0, 0),
    })
    expect(preview).toEqual({ kind: 'no_deposit' })
  })

  it('con seña paga y dentro de la ventana de reembolso → refund', () => {
    const bookingStart = Date.UTC(2026, 6, 20, 12, 0, 0)
    const preview = getCancellationPreview({
      depositStatus: 'paid',
      depositAmountCents: 450_000,
      bookingStartUtcMs: bookingStart,
      policyHours: 12,
      nowMs: bookingStart - 13 * HOUR, // 13h antes: todavía dentro del plazo de 12h
    })
    expect(preview).toEqual({ kind: 'refund', amountCents: 450_000 })
  })

  it('con seña paga y fuera de la ventana de reembolso → no_refund', () => {
    const bookingStart = Date.UTC(2026, 6, 20, 12, 0, 0)
    const preview = getCancellationPreview({
      depositStatus: 'paid',
      depositAmountCents: 450_000,
      bookingStartUtcMs: bookingStart,
      policyHours: 12,
      nowMs: bookingStart - 1 * HOUR, // 1h antes: ya pasó el plazo de 12h
    })
    expect(preview).toEqual({ kind: 'no_refund', amountCents: 450_000 })
  })
})
