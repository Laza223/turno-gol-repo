import type { GridBooking } from '@/lib/booking/grid-cells'

/**
 * Qué significa "cobrar" para este turno. Los tres caminos existen porque el
 * backend valida estados distintos, no por gusto:
 *  - `settle`  — el turno ya se jugó y quedó saldo (chargeDebtAction exige
 *                status 'completed').
 *  - `finish`  — está confirmado y ya terminó: cobrar y darlo por jugado en el
 *                mismo movimiento, que es lo que realmente pasa en el mostrador.
 *  - `advance` — todavía no terminó: es un adelanto, y el backend sólo acepta
 *                una línea, así que el mixto se deshabilita en vez de mentir.
 */
export type ChargeMode = 'settle' | 'finish' | 'advance' | null

export function chargeMode(booking: GridBooking, hasEnded: boolean): ChargeMode {
  const pending = booking.pending
  if (typeof pending !== 'number' || pending <= 0) return null
  if (booking.type === 'block' || booking.type === 'tournament') return null
  if (booking.status === 'completed') return 'settle'
  if (booking.status === 'confirmed') return hasEnded ? 'finish' : 'advance'
  return null
}

export const CHARGE_COPY: Record<Exclude<ChargeMode, null>, { title: string; cta: string }> = {
  settle: { title: 'Cobrar lo que falta', cta: 'Cobrar' },
  finish: { title: 'Cobrar y dar por jugado', cta: 'Cobrar y cerrar turno' },
  advance: { title: 'Cobrar por adelantado', cta: 'Registrar cobro' },
}
