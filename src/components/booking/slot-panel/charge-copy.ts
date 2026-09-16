import { formatArs } from '@/lib/format'
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

/**
 * El rótulo del botón que cobra, con el monto adentro.
 *
 * El monto va EN el botón y no en un campo aparte: es lo que falta, el panel ya
 * lo sabe, y verlo antes de tocar es lo que evita tener que leer una tabla para
 * saber qué se está por cobrar.
 *
 * H017: el verbo es siempre "cobrar". Antes el título y el botón del MISMO panel
 * decían cosas distintas ("cerrar"/"registrar"), y "cerrar" además es el verbo
 * reservado para el cierre de caja.
 *
 * D3 (2026-09-15): el monto ahora se puede editar a la vista (ya no vive
 * detrás de "Cobrar otro monto"), así que el botón tiene que reflejar lo que
 * el admin tipeó, no siempre el pendiente completo. En `finish` un parcial
 * igual da el turno por jugado — el saldo que queda es deuda, no algo que
 * frene el cobro, y el rótulo lo dice para que no se confunda con un cobro
 * total.
 *
 * Revisión (yellow): el monto NO se clampea contra `pendingCents`. Si lo
 * tipeado queda por encima del pendiente (p. ej. por la corrupción de
 * `money.ts` al editar un valor ya agrupado en miles), clampear lo escondía:
 * el botón mostraba el pendiente completo con rótulo de cobro normal y recién
 * al hacer click aparecía el error citando un monto que el admin nunca vio en
 * pantalla. Mostrar el monto real deja la discordancia a la vista ANTES de
 * tocar "Cobrar".
 */
export function chargeCta(
  mode: Exclude<ChargeMode, null>,
  pendingCents: number,
  amountCents: number,
): string {
  const monto = formatArs(amountCents)
  if (amountCents > pendingCents) {
    return `Cobrar ${monto} · supera lo pendiente (${formatArs(pendingCents)})`
  }
  const isFull = amountCents > 0 && amountCents === pendingCents
  if (isFull) {
    if (mode === 'finish') return `Cobrar ${monto} y dar por jugado`
    if (mode === 'advance') return `Cobrar ${monto} por adelantado`
    return `Cobrar ${monto}`
  }
  const resto = formatArs(pendingCents - amountCents)
  if (mode === 'finish') return `Cobrar ${monto} y dar por jugado · quedan ${resto} de deuda`
  if (mode === 'advance') return `Cobrar ${monto} por adelantado · quedan ${resto}`
  return `Cobrar ${monto} · quedan ${resto}`
}
