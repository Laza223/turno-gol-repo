import { describe, it, expect } from 'vitest'
import { isValidMovement } from '@/app/(admin)/caja/components/is-valid-movement'

// Fase 4 UX: mismas reglas que el setError de RegisterMovementModal.handleSubmit
// (monto finito >0, descripción no vacía), pero derivadas ANTES del submit para
// habilitar/deshabilitar el botón "Guardar".
describe('isValidMovement', () => {
  it('rechaza monto vacío', () => {
    expect(isValidMovement('', 'Seña turno 20:00')).toBe(false)
  })

  it('rechaza monto 0', () => {
    expect(isValidMovement('0', 'Seña turno 20:00')).toBe(false)
  })

  it('rechaza monto negativo', () => {
    expect(isValidMovement('-100', 'Seña turno 20:00')).toBe(false)
  })

  it('rechaza monto no numérico', () => {
    expect(isValidMovement('abc', 'Seña turno 20:00')).toBe(false)
  })

  it('acepta un monto decimal válido', () => {
    expect(isValidMovement('45.5', 'Seña turno 20:00')).toBe(true)
  })

  it('rechaza descripción vacía', () => {
    expect(isValidMovement('4500', '')).toBe(false)
  })

  it('rechaza descripción de solo espacios', () => {
    expect(isValidMovement('4500', '   ')).toBe(false)
  })

  it('acepta monto y descripción válidos', () => {
    expect(isValidMovement('4500', 'Seña turno 20:00')).toBe(true)
  })
})
