// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BusinessHeader from '@/components/site/BusinessHeader'

afterEach(() => cleanup())

describe('BusinessHeader', () => {
  it('linkea Ingresar -> /login y Empezar gratis -> /register', () => {
    render(<BusinessHeader />)
    expect(screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: /empezar gratis/i }).getAttribute('href')).toBe('/register')
  })

  it('no muestra navegación de jugador (Explorar)', () => {
    render(<BusinessHeader />)
    expect(screen.queryByRole('link', { name: /explorar/i })).toBeNull()
  })
})
