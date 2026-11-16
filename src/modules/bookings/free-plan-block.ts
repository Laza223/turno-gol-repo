import { FREE_PLAN_BLOCK_REASONS, SLOT_DURATION_MINUTES } from '@/shared/constants'
import { hhmmToMins } from '@/shared/time/operating-day'

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

/** Editar un turno en gratis: solo el nombre y el teléfono (decisión del 2026-11-16). */
export const FREE_PLAN_EDIT_ERROR =
  'En el plan gratis podés corregir el nombre y el teléfono. La duración y el precio son con el plan.'

/** El Evento de varias horas es del plan: en gratis el turno es de una hora, como en la grilla. */
export const FREE_PLAN_DURATION_ERROR =
  'En el plan gratis el turno es de una hora. Los eventos de varias horas son con el plan.'

type ManualBookingInput = {
  type: 'spontaneous' | 'block'
  timeStart?: string
  timeEnd?: string
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
  if (input.type === 'spontaneous' && input.timeStart && input.timeEnd) {
    const start = hhmmToMins(input.timeStart)
    const end = hhmmToMins(input.timeEnd)
    // El legado `time_end='00:00'` de medianoche cuenta como 24:00.
    const minutes = (end <= start ? end + 24 * 60 : end) - start
    if (minutes !== SLOT_DURATION_MINUTES) return FREE_PLAN_DURATION_ERROR
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
