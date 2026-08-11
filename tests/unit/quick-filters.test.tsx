// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
let current = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => current,
}))
// El drawer importa ExplorarFilters (client con navegación); lo mockeamos.
vi.mock('@/app/(public)/explorar/components/ExplorarFilters', () => ({ default: () => null }))

import QuickFilters from '@/app/(public)/explorar/components/QuickFilters'

beforeEach(() => {
  push.mockClear()
  current = new URLSearchParams('')
})
afterEach(() => cleanup())

describe('QuickFilters', () => {
  it('activar "Fútbol 5" agrega formats=5 a la URL', () => {
    render(<QuickFilters />)
    fireEvent.click(screen.getByRole('button', { name: 'Fútbol 5' }))
    expect(push).toHaveBeenCalledWith('/explorar?formats=5')
  })

  it('activar "Online" agrega online=1', () => {
    render(<QuickFilters />)
    fireEvent.click(screen.getByRole('button', { name: /Online/ }))
    expect(push).toHaveBeenCalledWith('/explorar?online=1')
  })

  it('refleja estado activo desde la URL (aria-pressed)', () => {
    current = new URLSearchParams('formats=5')
    render(<QuickFilters />)
    expect(screen.getByRole('button', { name: 'Fútbol 5' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })
})
