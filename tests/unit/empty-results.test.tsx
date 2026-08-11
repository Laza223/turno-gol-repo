// @vitest-environment happy-dom
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import EmptyResults from '@/app/(public)/explorar/components/EmptyResults'

afterEach(() => cleanup())

describe('EmptyResults', () => {
  it('sin búsqueda temporal muestra el mensaje genérico + reset', () => {
    render(<EmptyResults avail={null} />)
    expect(screen.getByText(/No encontramos complejos/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Limpiar búsqueda' }).getAttribute('href')).toBe(
      '/explorar',
    )
  })

  it('con fecha+hora muestra el mensaje de disponibilidad formateado', () => {
    render(<EmptyResults avail={{ date: '2026-06-15', time: '19:00' }} />)
    expect(screen.getByText(/15\/06\/2026/)).toBeTruthy()
    expect(screen.getByText(/19:00/)).toBeTruthy()
  })
})
