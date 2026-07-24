/**
 * Tarea #8 — "Cobros de turno": resume cuánto se pagó de un booking y cuánto
 * falta. Lógica pura para poder testearla sin DB; el wiring (query + action)
 * la consume con los totales reales.
 *
 * Dinero ya cobrado = seña efectivamente en poder del complejo + cobros de
 * mostrador (cash_flows income vinculados al booking_id). La seña solo cuenta
 * si está `paid` (retenida) o `captured` (quedó para el complejo); `refunded`
 * o `not_required` no son dinero cobrado.
 */
export function summarizeBookingCharges(opts: {
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  chargesTotal: number
}): { depositCounted: number; totalPaid: number; pending: number } {
  const depositCounted =
    opts.depositStatus === 'paid' || opts.depositStatus === 'captured'
      ? opts.depositAmount
      : 0
  const totalPaid = depositCounted + opts.chargesTotal
  const pending = Math.max(0, opts.priceSnapshot - totalPaid)
  return { depositCounted, totalPaid, pending }
}

/**
 * ENS-21: marcador determinístico y único por booking para el cash_flow que
 * se inserta al confirmarse un depósito (seña), sea por MP (`handleApproved`,
 * payment.service.ts) o confirmado a mano por el staff en efectivo/transferencia/
 * otro (`confirmManualDepositPayment`, mismo archivo). `getBookingCharges`
 * (reservas/queries.ts) lo usa para EXCLUIR esa fila de "cobros de mostrador":
 * la seña ya se cuenta vía `deposit_status`/`deposit_amount` en
 * `summarizeBookingCharges` de arriba, así que dejarla entrar en `chargesTotal`
 * la duplicaría (contrato exige category='booking' para esa fila, igual que un
 * cobro manual — no hay una columna/categoría propia para diferenciarla sin
 * migración de schema, así que el match exacto de `description`, con el
 * bookingId completo embebido, es la vía de exclusión: mismo idiom que
 * `prepareRefund`'s `description = 'Refund of ' + original.id`, Fix #53).
 * Método-agnóstico a propósito: el `method` real de la fila ya se muestra
 * aparte en la UI (/caja), así que el texto no debe asumir MercadoPago.
 */
export function depositCashFlowDescription(bookingId: string): string {
  return `Seña — turno ${bookingId}`
}
