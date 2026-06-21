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
