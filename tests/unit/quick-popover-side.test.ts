import { describe, expect, it } from 'vitest'
import { quickPopoverSide } from '@/components/booking/grid/quick-popover-side'

describe('quickPopoverSide', () => {
  it('abre a la derecha si entra', () => {
    // Primera de varias canchas en escritorio.
    expect(quickPopoverSide({ left: 163, right: 400 }, 1280)).toBe('right')
  })

  it('abre a la izquierda si no entra a la derecha pero sí a la izquierda', () => {
    // Última cancha: pegada al borde derecho.
    expect(quickPopoverSide({ left: 900, right: 1245 }, 1280)).toBe('left')
  })

  it('abre abajo si no entra a ningún costado', () => {
    // Una sola cancha a 1280×720: la celda que dejaba el formulario cortado en CI.
    expect(quickPopoverSide({ left: 163, right: 1245 }, 1280)).toBe('bottom')
  })

  it('prefiere la derecha cuando entra a los dos lados', () => {
    expect(quickPopoverSide({ left: 500, right: 600 }, 1440)).toBe('right')
  })
})
