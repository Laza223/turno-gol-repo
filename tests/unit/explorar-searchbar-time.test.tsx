// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const pushMock = vi.fn()
let currentParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => currentParams,
}))

import SearchBar from '@/app/(public)/explorar/components/SearchBar'

function submitForm() {
  fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas' }))
}

beforeEach(() => {
  pushMock.mockReset()
  currentParams = new URLSearchParams()
  // 20/10/2026 23:30 ART = 21/10 02:30 UTC: "hoy" es el 20 en ART y el 21 en UTC.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T02:30:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SearchBar /explorar — hora sin día', () => {
  it('una hora sin día se busca para hoy (ART)', () => {
    currentParams = new URLSearchParams('time=20:00')
    render(<SearchBar cities={[]} />)
    submitForm()
    const url = new URL(String(pushMock.mock.calls[0]?.[0]), 'https://turnogol.app')
    expect(url.searchParams.get('date')).toBe('2026-10-20')
    expect(url.searchParams.get('time')).toBe('20:00')
  })

  it('el campo Fecha muestra hoy cuando la URL trae solo la hora', () => {
    currentParams = new URLSearchParams('time=20:00')
    render(<SearchBar cities={[]} />)
    expect(screen.getByLabelText('Fecha').textContent).toBe('20/10/2026')
  })

  it('un día explícito se respeta', () => {
    currentParams = new URLSearchParams('date=2026-10-25&time=20:00')
    render(<SearchBar cities={[]} />)
    submitForm()
    const url = new URL(String(pushMock.mock.calls[0]?.[0]), 'https://turnogol.app')
    expect(url.searchParams.get('date')).toBe('2026-10-25')
  })

  it('sin hora no inventa un día', () => {
    render(<SearchBar cities={[]} />)
    submitForm()
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
  })
})
