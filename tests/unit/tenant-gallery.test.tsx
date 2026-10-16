// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TenantGallery from '@/app/(public)/[slug]/components/TenantGallery'

afterEach(() => cleanup())

const photos = (n: number) => Array.from({ length: n }, (_, i) => `/bg-${i}.png`)

// En el celular las miniaturas van ocultas (`hidden sm:block`): sin este botón "Fotos (3)" mostraba
// una sola foto y nada decía que había más.
describe('TenantGallery: botón "Ver N fotos" del celular', () => {
  it('con tres fotos o más hay un botón con la cantidad, tocable (44 px) y solo bajo sm', () => {
    render(<TenantGallery photos={photos(3)} name="Cancha X" />)

    const button = screen.getByRole('button', { name: 'Ver 3 fotos' })
    expect(button.classList.contains('min-h-11')).toBe(true)
    expect(button.classList.contains('min-w-11')).toBe(true)
    expect(button.classList.contains('sm:hidden')).toBe(true)
    // Fondo sólido, sin vidrio ni sombra.
    expect(button.classList.contains('bg-card')).toBe(true)
    expect(button.className).not.toMatch(/backdrop-blur|shadow/)
  })

  it('abre la galería en la primera foto', () => {
    render(<TenantGallery photos={photos(6)} name="Cancha X" />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver 6 fotos' }))

    expect(screen.getByRole('dialog', { name: 'Fotos de Cancha X' })).toBeTruthy()
    expect(screen.getByText('1 / 6')).toBeTruthy()
  })

  it('con una o dos fotos no hay botón: ya se ven todas', () => {
    for (const n of [1, 2]) {
      const view = render(<TenantGallery photos={photos(n)} name="Cancha X" />)
      expect(screen.queryByRole('button', { name: /^Ver \d+ fotos$/ })).toBeNull()
      view.unmount()
    }
  })
})
