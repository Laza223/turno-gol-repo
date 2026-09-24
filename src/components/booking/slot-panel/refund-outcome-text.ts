import { formatArs } from '@/lib/format'
import type { RefundOutcome } from '@/modules/bookings/refund-outcome'

/**
 * El texto del aviso de seña que muestran los dos diálogos de cancelar
 * (`BookingActions.tsx` y `SlotCancelDialog.tsx`), a partir del único
 * `RefundOutcome` (`getRefundOutcome`, `@/modules/bookings/refund-outcome`).
 *
 * Decisión del dueño (2026-09-24): en `undecided` se muestran LOS DOS
 * resultados concretos, con el monto de cada uno — no un veredicto único
 * "como si fuera jugador" (el bug que motivó este fix).
 */
export function refundOutcomeText(outcome: RefundOutcome): string {
  switch (outcome.kind) {
    case 'no_deposit':
      return 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    case 'turno_ended':
      return `El turno ya se jugó: la seña de ${formatArs(outcome.amountCents)} queda para el complejo (sin reembolso).`
    case 'undecided': {
      const amount = formatArs(outcome.amountCents)
      const playerClause = outcome.ifPlayer.shouldRefund
        ? `la seña de ${amount} queda para devolver (dentro del plazo de ${outcome.policyHours}h)`
        : `la seña de ${amount} queda para el complejo (fuera del plazo de ${outcome.policyHours}h)`
      const complexClause = outcome.ifComplex.shouldRefund
        ? `la seña de ${amount} queda para devolver`
        : `la seña de ${amount} queda para el complejo`
      return `Si cancela el jugador: ${playerClause}. Si cancela el complejo: ${complexClause}.`
    }
    case 'refund':
      return outcome.channel === 'mercadopago'
        ? `La seña de ${formatArs(outcome.amountCents)} queda para devolver: hacelo vos desde tu MercadoPago (no es automático) — si la devolvés ahí, el sistema la marca sola.`
        : `La seña de ${formatArs(outcome.amountCents)} queda para devolver: la devolvés vos (efectivo o transferencia) y la marcás en Caja → Cuentas.`
    case 'no_refund_policy':
      return `Fuera del plazo de cancelación (${outcome.policyHours}h): la seña de ${formatArs(outcome.amountCents)} queda para el complejo (sin reembolso).`
  }
}
