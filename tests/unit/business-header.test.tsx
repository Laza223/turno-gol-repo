// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// next/image necesita config de runtime; lo simplificamos a un <img> para que
// el render de <Logo> no rompa en happy-dom (Invalid URL) al correr la suite.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, never>)} />
  },
}))

import BusinessHeader from '@/components/site/BusinessHeader'

afterEach(() => cleanup())

describe('BusinessHeader', () => {
  it('linkea Ingresar -> /login y Empezar gratis -> /register', () => {
    render(<BusinessHeader />)
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: /empezar gratis/i }).getAttribute('href')).toBe(
      '/register',
    )
  })

  it('no muestra navegación de jugador (Explorar)', () => {
    render(<BusinessHeader />)
    expect(screen.queryByRole('link', { name: /explorar/i })).toBeNull()
  })
})
