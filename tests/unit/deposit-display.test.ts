import { describe, expect, it } from 'vitest'
import { resolveDepositDisplayStatus } from '@/app/(admin)/reservas/deposit-display'

/**
 * Punto 4 de docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md: un
 * pago tardío deja el turno diciendo "Seña pendiente" con la plata ya devuelta,
 * y `bookings.deposit_status` no se puede corregir porque el trigger de estado
 * terminal rechaza cualquier UPDATE sobre un booking `expired`.
 */
describe('resolveDepositDisplayStatus', () => {
  it('pending + reembolso en payments → se muestra reembolsada', () => {
    expect(resolveDepositDisplayStatus('pending', true)).toBe('refunded')
  })

  it('sin reembolso no toca nada', () => {
    expect(resolveDepositDisplayStatus('pending', false)).toBe('pending')
    expect(resolveDepositDisplayStatus('pending', undefined)).toBe('pending')
  })

  // El override es angosto a propósito: desde 'paid'/'captured' un refund puede
  // ser PARCIAL, y decir "reembolsada" a secas mentiría en la otra dirección.
  it('no pisa paid ni captured aunque haya un reembolso', () => {
    expect(resolveDepositDisplayStatus('paid', true)).toBe('paid')
    expect(resolveDepositDisplayStatus('captured', true)).toBe('captured')
  })

  it('una cancelación con reembolso normal ya viene coherente', () => {
    expect(resolveDepositDisplayStatus('refunded', true)).toBe('refunded')
  })
})
