// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const backMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: backMock }),
}))

import { BackLink } from '@/components/admin/BackLink'

/** `history.length` es de solo lectura en el DOM: se pisa por test. */
function setHistoryLength(n: number) {
  Object.defineProperty(window.history, 'length', { configurable: true, get: () => n })
}

beforeEach(() => {
  backMock.mockClear()
})
afterEach(() => {
  setHistoryLength(1)
})

describe('BackLink — "Volver" del detalle de un turno', () => {
  it('con historial vuelve a la pantalla anterior y no sigue el href', () => {
    setHistoryLength(3)
    render(
      <BackLink href="/reservas" smart>
        Volver
      </BackLink>,
    )
    const link = screen.getByRole('link', { name: 'Volver' })
    const notPrevented = fireEvent.click(link)
    expect(backMock).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
  })

  it('sin historial (pestaña nueva, push) sigue el href a /reservas', () => {
    setHistoryLength(1)
    render(
      <BackLink href="/reservas" smart>
        Volver
      </BackLink>,
    )
    const link = screen.getByRole('link', { name: 'Volver' })
    expect(link.getAttribute('href')).toBe('/reservas')
    fireEvent.click(link)
    expect(backMock).not.toHaveBeenCalled()
  })

  it('Ctrl/⌘/Shift-clic abre /reservas en otra pestaña: no intercepta', () => {
    setHistoryLength(3)
    render(
      <BackLink href="/reservas" smart>
        Volver
      </BackLink>,
    )
    const link = screen.getByRole('link', { name: 'Volver' })
    fireEvent.click(link, { ctrlKey: true })
    fireEvent.click(link, { metaKey: true })
    fireEvent.click(link, { shiftKey: true })
    expect(backMock).not.toHaveBeenCalled()
  })
})
