import { describe, expect, it } from 'vitest'
import { resolveDepositDisplayStatus } from '@/app/(admin)/reservas/deposit-display'

/**
 * `bookings.deposit_status` no alcanza para saber si la seña se devolvió, por
 * dos motivos distintos:
 *
 *  1. Pago tardío (punto 4 de
 *     docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md): el turno
 *     dice "Seña pendiente" con la plata ya devuelta.
 *  2. Cancelación: `deposit_status='refunded'` se escribe en la misma
 *     transacción en que se cancela, ANTES de que la plata se mueva.
 *
 * En los dos casos la fila queda congelada (el trigger de la migr. 070 rechaza
 * cualquier UPDATE sobre un booking terminal), así que la verdad la tiene
 * `payments` y la etiqueta se resuelve al leer.
 */
describe('resolveDepositDisplayStatus', () => {
  it('pending + devolución saldada → se muestra devuelta', () => {
    expect(resolveDepositDisplayStatus('pending', 'settled')).toBe('refunded')
  })

  /**
   * LA regresión que este resolver existe para evitar. La cancelación deja
   * `deposit_status='refunded'` de entrada; si además hay una fila de refund en
   * `pending`, la plata NO se movió y el complejo la debe. Antes de este cambio
   * el staff leía "Seña reembolsada" sobre plata que nunca salió.
   */
  it('refunded + devolución pendiente → a devolver, no devuelta', () => {
    expect(resolveDepositDisplayStatus('refunded', 'pending')).toBe('refund_pending')
  })

  it('pending + devolución pendiente → a devolver', () => {
    expect(resolveDepositDisplayStatus('pending', 'pending')).toBe('refund_pending')
  })

  it('refunded + devolución saldada → devuelta', () => {
    expect(resolveDepositDisplayStatus('refunded', 'settled')).toBe('refunded')
  })

  it('sin fila de refund no toca nada', () => {
    expect(resolveDepositDisplayStatus('pending', 'none')).toBe('pending')
    expect(resolveDepositDisplayStatus('pending', undefined)).toBe('pending')
    expect(resolveDepositDisplayStatus('paid', 'none')).toBe('paid')
    // Cancelación vieja en efectivo, anterior a que se registre la deuda de
    // devolución: no hay evidencia en `payments`, así que no se inventa nada.
    expect(resolveDepositDisplayStatus('refunded', 'none')).toBe('refunded')
  })

  // El override sigue siendo angosto en esta dirección: desde 'paid'/'captured'
  // un refund puede ser PARCIAL, y decir "devuelta" a secas mentiría al revés.
  it('no pisa paid ni captured aunque haya un refund', () => {
    expect(resolveDepositDisplayStatus('paid', 'settled')).toBe('paid')
    expect(resolveDepositDisplayStatus('paid', 'pending')).toBe('paid')
    expect(resolveDepositDisplayStatus('captured', 'settled')).toBe('captured')
    expect(resolveDepositDisplayStatus('captured', 'pending')).toBe('captured')
  })
})
