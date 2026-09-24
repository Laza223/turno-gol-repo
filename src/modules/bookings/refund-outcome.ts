// De `refund-policy.ts` (no de `booking.cancellation.ts`) A PROPÓSITO: ese
// archivo trae drizzle-orm/DB/pagos/notificaciones y `getRefundOutcome` lo usa
// un componente cliente (`HoyChargeModalDialogs.tsx`, `BookingActions.tsx`) —
// importar del módulo pesado rompería el bundle del browser (`node:crypto`
// vía `@/shared/db/audit` → `impersonation-cookie.ts`).
import { decideAdminRefund, type AdminCancellationType } from './refund-policy'

/**
 * Único cálculo de "qué pasa con la seña si cancelo AHORA" para la UI admin
 * (los dos diálogos de cancelar: `BookingActions.tsx` y `SlotCancelDialog.tsx`
 * — antes cada uno hacía su propia cuenta a mano y divergían). Reusa
 * `decideAdminRefund` como única fuente del booleano: esta función NO
 * reimplementa la fórmula, solo la envuelve en los 5 resultados que la UI
 * necesita mostrar.
 *
 * Decisión del dueño (2026-09-24): mientras no se eligió quién cancela, se
 * muestran LOS DOS resultados concretos (`undecided`), no un veredicto único
 * "como si fuera jugador" — eso era el bug que motivó este fix.
 *
 * El canal de devolución (`channel`) sale de `paymentMethod === 'mercadopago'`
 * — es el único dato que tiene el cliente; el backend (`registerRefundDue`,
 * `booking.cancellation.ts`) decide por el `payment_id` aprobado. En el flujo
 * normal coinciden (`confirmManualDepositPayment` limpia los dos juntos), así
 * que este criterio es un preview, no la fuente de verdad.
 */
export type RefundOutcome =
  | { kind: 'no_deposit' }
  | { kind: 'turno_ended'; amountCents: number }
  | {
      kind: 'undecided'
      amountCents: number
      policyHours: number
      ifPlayer: { shouldRefund: boolean }
      ifComplex: { shouldRefund: boolean }
    }
  | { kind: 'refund'; amountCents: number; channel: 'mercadopago' | 'manual' }
  | { kind: 'no_refund_policy'; amountCents: number; policyHours: number }

export function getRefundOutcome(opts: {
  depositStatus: string
  depositAmountCents: number
  paymentMethod: string | null
  bookingStartUtcMs: number
  bookingEndUtcMs: number
  policyHours: number
  nowMs: number
  cancellationType: AdminCancellationType | null
}): RefundOutcome {
  const hasPaidDeposit = opts.depositStatus === 'paid' && opts.depositAmountCents > 0
  if (!hasPaidDeposit) return { kind: 'no_deposit' }

  const common = {
    bookingStartUtcMs: opts.bookingStartUtcMs,
    bookingEndUtcMs: opts.bookingEndUtcMs,
    policyHours: opts.policyHours,
    nowMs: opts.nowMs,
  }

  // El guard de "turno ya terminado" vive en `decideAdminRefund` (B3): se
  // detecta acá pidiéndole el veredicto 'complejo' (el más generoso) — si ni
  // así reembolsa, es porque ya se jugó.
  const asComplex = decideAdminRefund({ cancellationType: 'complejo', ...common })
  if (opts.nowMs >= opts.bookingEndUtcMs) {
    return { kind: 'turno_ended', amountCents: opts.depositAmountCents }
  }

  if (opts.cancellationType === null) {
    const asPlayer = decideAdminRefund({ cancellationType: 'jugador', ...common })
    return {
      kind: 'undecided',
      amountCents: opts.depositAmountCents,
      policyHours: opts.policyHours,
      ifPlayer: { shouldRefund: asPlayer.shouldRefund },
      ifComplex: { shouldRefund: asComplex.shouldRefund },
    }
  }

  const decision =
    opts.cancellationType === 'complejo'
      ? asComplex
      : decideAdminRefund({ cancellationType: 'jugador', ...common })

  if (decision.shouldRefund) {
    const channel = opts.paymentMethod === 'mercadopago' ? 'mercadopago' : 'manual'
    return { kind: 'refund', amountCents: opts.depositAmountCents, channel }
  }
  return {
    kind: 'no_refund_policy',
    amountCents: opts.depositAmountCents,
    policyHours: opts.policyHours,
  }
}
