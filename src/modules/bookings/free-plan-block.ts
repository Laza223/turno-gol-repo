import { FREE_PLAN_BLOCK_REASONS } from '@/shared/constants'

/**
 * Plan gratis (freemium, decisión 3 de docs/decisions/2026-11-08-freemium-spec-y-estado-free.md):
 * el dueño solo puede marcar un horario como ocupado, sin nombre, teléfono,
 * notas, jugador ni plata. Anotar quién juega y cuánto paga es del plan pago.
 *
 * Lista cerrada a propósito: un motivo libre ("Otro") sería un nombre de
 * persona encubierto y el gratis se volvería un pago sin tope.
 */

export const FREE_PLAN_BOOKING_ERROR =
  'En el plan gratis solo podés marcar el horario como ocupado. Anotar quién juega y cuánto paga es con el plan.'

type ManualBookingInput = {
  type: 'spontaneous' | 'block'
  playerId?: string
  guestName?: string
  guestPhone?: string
  priceOverride?: number
  depositAmount?: number
  depositMethod?: string
  depositStatus?: string
  notesInternal?: string
  notesPlayer?: string
}

/** `null` si la carga entra en el plan gratis; si no, el mensaje para el dueño. */
export function freePlanBookingError(input: ManualBookingInput): string | null {
  if (input.type !== 'block') return FREE_PLAN_BOOKING_ERROR
  const reason = input.guestName ?? 'Ocupado'
  if (!(FREE_PLAN_BLOCK_REASONS as readonly string[]).includes(reason)) {
    return FREE_PLAN_BOOKING_ERROR
  }
  if (
    input.playerId !== undefined ||
    input.guestPhone !== undefined ||
    input.notesInternal !== undefined ||
    input.notesPlayer !== undefined ||
    (input.priceOverride !== undefined && input.priceOverride !== 0) ||
    (input.depositAmount !== undefined && input.depositAmount !== 0) ||
    input.depositMethod !== undefined ||
    input.depositStatus !== undefined
  ) {
    return FREE_PLAN_BOOKING_ERROR
  }
  return null
}
