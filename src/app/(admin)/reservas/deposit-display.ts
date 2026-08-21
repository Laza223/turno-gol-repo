/**
 * Estado de la seña PARA MOSTRAR, que no siempre es `bookings.deposit_status`.
 *
 * El caso que obliga a esto (punto 4 de
 * `docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md`): un pago
 * tardío — MP acredita la seña DESPUÉS de que la reserva expiró — deja el
 * turno mostrando "Seña pendiente" cuando la plata entró y ya volvió. El dato
 * es falso y confunde justo al complejo que acaba de recibir el mail de pago
 * tardío.
 *
 * Por qué no se arregla en la base, que sería lo obvio: poner
 * `deposit_status='refunded'` es imposible. `expired` es terminal y el trigger
 * `enforce_booking_invariants_fn` (migr. 070) rechaza cualquier UPDATE sobre un
 * booking terminal — la misma pared que hace que el turno no se pueda
 * resucitar. Así que el arreglo es de LECTURA.
 *
 * Por qué no se toca `depositStatus` a secas: no es solo una etiqueta. Gobierna
 * los previews de reembolso y qué acciones se ofrecen (`BookingActions`,
 * `QuickActions`, `summarizeBookingCharges`). Reescribirlo desde la UI
 * cambiaría comportamiento de plata para arreglar un texto.
 */

/**
 * @param depositStatus el `bookings.deposit_status` crudo.
 * @param depositRefunded hay un `payments` tipo `refund` en `approved`/`pending`
 *   para esta reserva.
 *
 * El override es DELIBERADAMENTE angosto — solo desde `pending`. Una
 * cancelación con reembolso normal ya deja `deposit_status='refunded'` y las
 * dos fuentes coinciden; `paid`/`captured` con un refund encima puede ser un
 * reembolso PARCIAL, donde "reembolsada" a secas mentiría en la otra dirección.
 * `pending` + refund en la base no tiene ninguna otra lectura posible: entró
 * plata que el booking nunca registró y que ya se está devolviendo.
 */
export function resolveDepositDisplayStatus(
  depositStatus: string,
  depositRefunded?: boolean,
): string {
  return depositRefunded && depositStatus === 'pending' ? 'refunded' : depositStatus
}
