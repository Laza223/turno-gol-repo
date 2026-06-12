// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const replaceMock = vi.fn()
let searchParamsInit = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/reservas',
  useSearchParams: () => new URLSearchParams(searchParamsInit),
}))

import { ReservasToolbar } from '@/app/(admin)/reservas/ReservasToolbar'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  searchParamsInit = ''
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ReservasToolbar — búsqueda URL-based', () => {
  it('debounce de 300ms: una sola navegación con el valor final', () => {
    render(<ReservasToolbar />)
    const input = screen.getByLabelText('Buscar por nombre o número de reserva')

    fireEvent.change(input, { target: { value: 'ju' } })
    fireEvent.change(input, { target: { value: 'juan' } })
    expect(replaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/reservas?q=juan', { scroll: false })
  })

  it('preserva dia y status existentes en la URL', () => {
    searchParamsInit = 'dia=historial&status=confirmed'
    render(<ReservasToolbar />)
    fireEvent.change(screen.getByLabelText('Buscar por nombre o número de reserva'), {
      target: { value: 'ana' },
    })
    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledWith('/reservas?dia=historial&status=confirmed&q=ana', {
      scroll: false,
    })
  })

  it('arranca con el ?q de la URL y el botón limpiar lo borra sin debounce', () => {
    searchParamsInit = 'q=maria'
    render(<ReservasToolbar />)
    const input = screen.getByLabelText<HTMLInputElement>('Buscar por nombre o número de reserva')
    expect(input.value).toBe('maria')

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(input.value).toBe('')
    expect(replaceMock).toHaveBeenCalledWith('/reservas', { scroll: false })
  })

  it('borrar el texto a mano quita ?q', () => {
    searchParamsInit = 'q=maria'
    render(<ReservasToolbar />)
    fireEvent.change(screen.getByLabelText('Buscar por nombre o número de reserva'), {
      target: { value: '' },
    })
    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledWith('/reservas', { scroll: false })
  })
})
