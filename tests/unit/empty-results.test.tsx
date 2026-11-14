// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import EmptyResults from '@/app/(public)/explorar/components/EmptyResults'

afterEach(() => cleanup())

describe('EmptyResults', () => {
  it('sin resultados muestra el mensaje genérico y el reset', () => {
    render(<EmptyResults />)
    expect(screen.getByText(/No encontramos complejos/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Limpiar búsqueda' }).getAttribute('href')).toBe(
      '/explorar',
    )
  })

  it('fuera de rango dice que se terminó la lista', () => {
    render(<EmptyResults outOfRange />)
    expect(screen.getByRole('heading', { name: 'No hay más complejos para mostrar' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Volver al principio' })).toBeTruthy()
  })
})
