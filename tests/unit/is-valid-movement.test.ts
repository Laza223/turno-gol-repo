import { describe, it, expect } from 'vitest'
import { isValidMovement } from '@/app/(admin)/caja/components/is-valid-movement'

// Fase 4 UX: mismas reglas que el setError de RegisterMovementModal.handleSubmit
// (monto en centavos > 0, descripción no vacía), pero derivadas ANTES del submit
// para habilitar/deshabilitar el botón "Guardar". Migrado a MoneyInput: el
// monto ahora llega como number|null en CENTAVOS (nunca string en pesos).
describe('isValidMovement', () => {
  it('rechaza monto null (campo vacío)', () => {
    expect(isValidMovement(null, 'Seña turno 20:00')).toBe(false)
  })

  it('rechaza monto 0', () => {
    expect(isValidMovement(0, 'Seña turno 20:00')).toBe(false)
  })

  it('rechaza monto negativo', () => {
    expect(isValidMovement(-10000, 'Seña turno 20:00')).toBe(false)
  })

  it('acepta un monto válido', () => {
    expect(isValidMovement(4550, 'Seña turno 20:00')).toBe(true)
  })

  it('rechaza descripción vacía', () => {
    expect(isValidMovement(450000, '')).toBe(false)
  })

  it('rechaza descripción de solo espacios', () => {
    expect(isValidMovement(450000, '   ')).toBe(false)
  })

  it('acepta monto y descripción válidos', () => {
    expect(isValidMovement(450000, 'Seña turno 20:00')).toBe(true)
  })
})
