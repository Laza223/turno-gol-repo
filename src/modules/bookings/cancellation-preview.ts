import { decideAdminRefund } from './refund-policy'
import { isLateCancel, lateCancelPenalty, type LateCancelPenalty } from './late-cancel'

/**
 * Consecuencia concreta de cancelar ESTE booking AHORA (ENS-2). Asume la
 * política normal de cancelación del jugador (`decideAdminRefund` con
 * cancellationType 'jugador' — el mismo cálculo que usa `cancelByPlayer`,
 * fuente de verdad real; NO inventa un umbral nuevo).
 */
export type CancellationPreview =
  // `lateCancel` solo viaja si cancelar AHORA cuenta como tardía (sin seña).
  | { kind: 'no_deposit'; lateCancel?: LateCancelPenalty }
  | { kind: 'refund'; amountCents: number }
  | { kind: 'no_refund'; amountCents: number }

export function getCancellationPreview(opts: {
  depositStatus: string
  depositAmountCents: number
  bookingStartUtcMs: number
  policyHours: number
  nowMs: number
  /** `settings.late_cancel_hours`; ausente o 0 = apagado. */
  lateCancelHours?: number
  /** Cancelaciones tardías del jugador en este complejo en la ventana de 60 días, sin contar esta. */
  lateCancelCount?: number
}): CancellationPreview {
  if (opts.depositStatus !== 'paid' || opts.depositAmountCents <= 0) {
    // Mismo criterio que `cancelByPlayer`: cuenta solo si la reserva nació sin seña.
    const late =
      opts.depositStatus === 'not_required' &&
      isLateCancel({
        startsAtMs: opts.bookingStartUtcMs,
        nowMs: opts.nowMs,
        hours: opts.lateCancelHours ?? 0,
      })
    return late
      ? { kind: 'no_deposit', lateCancel: lateCancelPenalty((opts.lateCancelCount ?? 0) + 1) }
      : { kind: 'no_deposit' }
  }
  const { inPolicy } = decideAdminRefund({
    cancellationType: 'jugador',
    bookingStartUtcMs: opts.bookingStartUtcMs,
    // B3: decideAdminRefund ahora exige bookingEndUtcMs para el guard de
    // "turno ya terminado" (afecta `shouldRefund`). Este preview solo lee
    // `inPolicy`, que no depende de ese guard — Infinity preserva el
    // comportamiento exacto de antes sin inventar una fecha de fin real.
    bookingEndUtcMs: Number.POSITIVE_INFINITY,
    policyHours: opts.policyHours,
    nowMs: opts.nowMs,
  })
  return inPolicy
    ? { kind: 'refund', amountCents: opts.depositAmountCents }
    : { kind: 'no_refund', amountCents: opts.depositAmountCents }
}
