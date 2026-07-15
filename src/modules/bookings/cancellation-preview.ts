import { decideAdminRefund } from './booking.cancellation'

/**
 * Consecuencia concreta de cancelar ESTE booking AHORA (ENS-2). Asume la
 * política normal de cancelación del jugador (`decideAdminRefund` con
 * cancellationType 'jugador' — el mismo cálculo que usa `cancelByPlayer`,
 * fuente de verdad real; NO inventa un umbral nuevo).
 */
export type CancellationPreview =
  | { kind: 'no_deposit' }
  | { kind: 'refund'; amountCents: number }
  | { kind: 'no_refund'; amountCents: number }

export function getCancellationPreview(opts: {
  depositStatus: string
  depositAmountCents: number
  bookingStartUtcMs: number
  policyHours: number
  nowMs: number
}): CancellationPreview {
  if (opts.depositStatus !== 'paid' || opts.depositAmountCents <= 0) {
    return { kind: 'no_deposit' }
  }
  const { inPolicy } = decideAdminRefund({
    cancellationType: 'jugador',
    bookingStartUtcMs: opts.bookingStartUtcMs,
    policyHours: opts.policyHours,
    nowMs: opts.nowMs,
  })
  return inPolicy
    ? { kind: 'refund', amountCents: opts.depositAmountCents }
    : { kind: 'no_refund', amountCents: opts.depositAmountCents }
}
