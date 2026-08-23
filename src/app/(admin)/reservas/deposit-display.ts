/**
 * Estado de la seña PARA MOSTRAR, que no siempre es `bookings.deposit_status`.
 *
 * Hay dos motivos, y el segundo es el importante.
 *
 * 1. Pago tardío (punto 4 de
 *    `docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md`): MP
 *    acredita la seña DESPUÉS de que la reserva expiró y el turno queda
 *    mostrando "Seña pendiente" cuando la plata entró y se está devolviendo.
 *
 * 2. La cancelación marca la devolución ANTES de que exista. `cancelByPlayer` /
 *    `cancelByAdmin` dejan `deposit_status='refunded'` en la misma transacción
 *    en que cancelan, mucho antes de que MercadoPago confirme nada — y el
 *    reembolso automático hoy falla siempre (403 de permisos). O sea:
 *    `deposit_status='refunded'` significa "CORRESPONDE devolución", no "ya se
 *    devolvió". Quien sabe la verdad es la fila `payments` con `type='refund'`.
 *
 * Por qué no se arregla en la base, que sería lo obvio: los estados
 * `canceled_*` y `expired` son terminales y el trigger
 * `enforce_booking_invariants_fn` (migr. 070) rechaza cualquier UPDATE sobre un
 * booking terminal. La fila queda congelada apenas se cancela, así que no hay
 * dónde escribir "ya devolví". El arreglo es de LECTURA.
 *
 * Por qué no se toca `depositStatus` a secas: no es solo una etiqueta. Gobierna
 * los previews de reembolso y qué acciones se ofrecen (`BookingActions`,
 * `QuickActions`, `summarizeBookingCharges`). Reescribirlo desde la UI
 * cambiaría comportamiento de plata para arreglar un texto.
 */

/**
 * Qué dice la tabla `payments` sobre la devolución de esta reserva.
 *
 * - `none`: no hay ninguna fila `type='refund'`.
 * - `pending`: hay al menos una en `status='pending'` — **el complejo debe
 *   plata**. Gana sobre `settled` a propósito: si hay una devolución sin
 *   resolver, eso es lo que el staff tiene que ver.
 * - `settled`: las que hay están todas en `approved` — la plata se movió.
 */
export type RefundState = 'none' | 'pending' | 'settled'

/**
 * @param depositStatus el `bookings.deposit_status` crudo.
 * @param refundState lo que dice `payments` (ver {@link RefundState}).
 *
 * Regla: **ante conflicto gana `payments`**, porque es la única de las dos
 * fuentes que se puede actualizar después de cancelar.
 *
 * El override sigue siendo angosto en una dirección: `paid` y `captured` no se
 * tocan. Un refund encima de esos dos puede ser un reembolso PARCIAL (hoy no
 * existen, pero el modelo los admite), y ahí "devuelta" a secas mentiría en la
 * otra dirección.
 */
export function resolveDepositDisplayStatus(
  depositStatus: string,
  refundState: RefundState = 'none',
): string {
  if (refundState === 'pending' && (depositStatus === 'pending' || depositStatus === 'refunded')) {
    return 'refund_pending'
  }
  if (refundState === 'settled' && depositStatus === 'pending') return 'refunded'
  return depositStatus
}
