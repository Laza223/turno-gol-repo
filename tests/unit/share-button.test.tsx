// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ShareButton from '@/components/public/ShareButton'

afterEach(() => cleanup())

describe('ShareButton', () => {
  it('por defecto muestra la etiqueta a la vista (explorar y el resto no cambian)', () => {
    render(<ShareButton />)

    const button = screen.getByRole('button', { name: 'Compartir' })
    expect(button.textContent).toBe('Compartir')
    expect(button.querySelector('.sr-only')).toBeNull()
  })

  it('iconOnly: sin texto a la vista, pero el nombre accesible sigue siendo "Compartir"', () => {
    render(<ShareButton iconOnly />)

    const button = screen.getByRole('button', { name: 'Compartir' })
    expect(button.querySelector('.sr-only')?.textContent).toBe('Compartir')
    // Lo único que no es `sr-only` es el ícono.
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('iconOnly con otra etiqueta usa esa como nombre accesible', () => {
    render(<ShareButton iconOnly label="Enviar este complejo" />)

    expect(screen.getByRole('button', { name: 'Enviar este complejo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Compartir' })).toBeNull()
  })
})
