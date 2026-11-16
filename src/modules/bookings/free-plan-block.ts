import { FREE_PLAN_BLOCK_REASONS } from '@/shared/constants'

/**
 * Plan gratis (freemium v2, docs/decisions/2026-11-15-freemium-corte-v2.md):
 * "gratis es quién juega; el plan es quién pagó". El dueño anota turnos con
 * nombre y teléfono, sin precio, cobro, seña, notas ni jugador vinculado.
 *
 * Los bloqueos siguen con motivos cerrados: un motivo libre ("Otro") sería una
 * nota encubierta, y las notas son del plan.
 */

export const FREE_PLAN_BOOKING_ERROR =
  'En el plan gratis anotás quién juega. El precio, los cobros y las notas son con el plan.'

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
  if (
    input.playerId !== undefined ||
    input.notesInternal !== undefined ||
    input.notesPlayer !== undefined ||
    (input.priceOverride !== undefined && input.priceOverride !== 0) ||
    (input.depositAmount !== undefined && input.depositAmount !== 0) ||
    input.depositMethod !== undefined ||
    input.depositStatus !== undefined
  ) {
    return FREE_PLAN_BOOKING_ERROR
  }
  if (input.type === 'block') {
    const reason = input.guestName ?? 'Ocupado'
    if (!(FREE_PLAN_BLOCK_REASONS as readonly string[]).includes(reason)) {
      return FREE_PLAN_BOOKING_ERROR
    }
    if (input.guestPhone !== undefined) return FREE_PLAN_BOOKING_ERROR
  }
  return null
}
