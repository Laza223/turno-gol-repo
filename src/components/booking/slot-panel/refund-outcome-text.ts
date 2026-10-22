import { formatArs } from '@/lib/format'
import type { RefundOutcome } from '@/modules/bookings/refund-outcome'
import { LATE_CANCEL_BAN_DAYS } from '@/shared/constants'

/** La escalera completa, para el encargado: el panel no sabe cuántas lleva el jugador. */
function lateCancelLadderText(conditional: boolean): string {
  const [first, max] = LATE_CANCEL_BAN_DAYS
  const lead = conditional
    ? 'Si lo pide el jugador, cuenta como cancelación tardía'
    : 'Cuenta como cancelación tardía'
  return `${lead}: la 1ra solo se le avisa; la 2da lo deja ${first} días sin reservar online y desde la 3ra, ${max} días.`
}

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
    case 'no_deposit': {
      const base = 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
      if (outcome.lateCancel === 'yes') return `${base} ${lateCancelLadderText(false)}`
      if (outcome.lateCancel === 'if_player') return `${base} ${lateCancelLadderText(true)}`
      return base
    }
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
