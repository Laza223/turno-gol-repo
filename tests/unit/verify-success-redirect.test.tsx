// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import SuccessRedirect from '@/app/(auth)/verify/SuccessRedirect'

const origLocation = Object.getOwnPropertyDescriptor(window, 'location')
let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  assign = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { assign, href: 'http://localhost/verify' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  if (origLocation) Object.defineProperty(window, 'location', origLocation)
  cleanup()
})

describe('SuccessRedirect', () => {
  it('redirige a next a los 5 segundos', () => {
    render(<SuccessRedirect next="/mis-reservas" />)
    expect(assign).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(5000))
    expect(assign).toHaveBeenCalledWith('/mis-reservas')
  })

  it('muestra una cuenta regresiva que decrementa', () => {
    render(<SuccessRedirect next="/mis-reservas" />)
    expect(screen.getByText(/5\s*s/)).toBeTruthy()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText(/4\s*s/)).toBeTruthy()
  })

  it('no redirige tras desmontar (cleanup de timers)', () => {
    const { unmount } = render(<SuccessRedirect next="/mis-reservas" />)
    unmount()
    act(() => vi.advanceTimersByTime(5000))
    expect(assign).not.toHaveBeenCalled()
  })
})
