// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import MisReservasLayout from '@/app/(player)/mis-reservas/layout'

afterEach(cleanup)

describe('/mis-reservas layout', () => {
  it('monta el mundo de La Reserva: es lo que cubre la page, su loading, su error y los diálogos', () => {
    const { container } = render(
      <MisReservasLayout>
        <p>contenido</p>
      </MisReservasLayout>,
    )
    const world = container.querySelector('[data-world="portal"]')
    expect(world).not.toBeNull()
    expect(world?.textContent).toBe('contenido')
  })
})
