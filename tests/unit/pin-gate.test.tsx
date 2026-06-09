// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { VerifyPinResult } from '@/app/(admin)/actions/pin'

// --- Mock server actions ---
vi.mock('@/app/(admin)/actions/pin', () => ({
  checkPinSessionAction: vi.fn(),
  verifyPinAction: vi.fn(),
}))

// --- Mock next/navigation router (#9: refresh tras verificar) ---
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

// --- Import mocks after vi.mock so they resolve correctly ---
import { checkPinSessionAction, verifyPinAction } from '@/app/(admin)/actions/pin'
import { PinGate } from '@/components/pin-gate'

const mockCheck = vi.mocked(checkPinSessionAction)
const mockVerify = vi.mocked(verifyPinAction)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// Helper: wait for the PIN form to appear (after checkPinSessionAction resolves).
async function waitForForm() {
  await waitFor(() => {
    expect(screen.getByLabelText('PIN')).toBeTruthy()
  })
}

// Helper: type a PIN value into the input.
function typePin(pin: string) {
  const input = screen.getByLabelText('PIN') as HTMLInputElement
  fireEvent.change(input, { target: { value: pin } })
}

// Helper: click the submit button.
function clickSubmit() {
  const btn = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
  fireEvent.click(btn)
}

describe('PinGate — spinner while checking session', () => {
  it('shows a spinner before checkPinSessionAction resolves', () => {
    // Never resolves during this tick → spinner stays visible.
    mockCheck.mockReturnValue(new Promise(() => undefined))
    render(<PinGate><div>SECRET</div></PinGate>)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('SECRET')).toBeNull()
  })
})

describe('PinGate — no active session → form appears', () => {
  it('renders the PIN form when checkPinSessionAction resolves false', async () => {
    mockCheck.mockResolvedValue(false)
    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()
    expect(screen.queryByText('SECRET')).toBeNull()
  })
})

describe('PinGate — lockout state', () => {
  it('shows countdown and disables input + button on locked response', async () => {
    mockCheck.mockResolvedValue(false)

    // Use a retryAtMs 90 seconds in the future (real timers — just checks the
    // initial render after the action resolves, not the countdown decrement).
    const retryAtMs = Date.now() + 90_000
    const lockedResult: VerifyPinResult = {
      ok: false,
      locked: true,
      retryAtMs,
      error: 'Demasiados intentos fallidos. Volvé a intentar en 2 min.',
    }
    mockVerify.mockResolvedValue(lockedResult)

    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()

    typePin('9999')

    await act(async () => {
      clickSubmit()
      // Let the async action promise resolve and state updates flush.
      await Promise.resolve()
    })

    // After the transition flushes, the lockout state should be set.
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Bloqueado hasta')
    }, { timeout: 5000 })

    const input = screen.getByLabelText('PIN') as HTMLInputElement
    expect(input.disabled).toBe(true)

    const btn = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('re-enables input after countdown reaches 0 (fake timers)', async () => {
    // Use fake timers from the very start so we control Date.now() and
    // setInterval throughout — this avoids the real-timer / fake-timer mixing
    // issue that breaks waitFor.
    const fakeNow = 1_700_000_000_000
    vi.useFakeTimers()
    vi.setSystemTime(fakeNow)

    // checkPinSessionAction resolves synchronously-ish via a resolved promise.
    mockCheck.mockResolvedValue(false)

    const retryAtMs = fakeNow + 90_000
    const lockedResult: VerifyPinResult = {
      ok: false,
      locked: true,
      retryAtMs,
      error: 'Demasiados intentos fallidos. Volvé a intentar en 2 min.',
    }
    mockVerify.mockResolvedValue(lockedResult)

    render(<PinGate><div>SECRET</div></PinGate>)

    // Flush microtasks so checkPinSessionAction resolves and setVerified(false)
    // is called, causing the form to render.
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByLabelText('PIN')).toBeTruthy()

    typePin('9999')

    // Submit — the action resolves asynchronously.
    await act(async () => {
      clickSubmit()
      await Promise.resolve()
    })

    // Flush any remaining microtasks so React processes the state update.
    await act(async () => {
      await Promise.resolve()
    })

    // Countdown alert should now be visible.
    expect(screen.getByRole('alert').textContent).toContain('Bloqueado hasta')
    expect((screen.getByLabelText('PIN') as HTMLInputElement).disabled).toBe(true)

    // Advance fake clock 91 seconds — this fires all setInterval callbacks.
    await act(async () => {
      vi.advanceTimersByTime(91_000)
    })

    // Countdown gone, input re-enabled (locked state cleared).
    expect(screen.queryByText(/Bloqueado hasta/)).toBeNull()
    expect((screen.getByLabelText('PIN') as HTMLInputElement).disabled).toBe(false)
  })
})

describe('PinGate — attemptsLeft warning', () => {
  it('shows warning when attemptsLeft <= 2', async () => {
    mockCheck.mockResolvedValue(false)

    const warnResult: VerifyPinResult = {
      ok: false,
      locked: false,
      attemptsLeft: 1,
      error: 'PIN incorrecto.',
    }
    mockVerify.mockResolvedValue(warnResult)

    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()

    typePin('9999')

    await act(async () => {
      clickSubmit()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('Te quedan 1 intentos antes del bloqueo.')).toBeTruthy()
    }, { timeout: 5000 })
  })

  it('does not show warning when attemptsLeft > 2', async () => {
    mockCheck.mockResolvedValue(false)

    const noWarnResult: VerifyPinResult = {
      ok: false,
      locked: false,
      attemptsLeft: 4,
      error: 'PIN incorrecto.',
    }
    mockVerify.mockResolvedValue(noWarnResult)

    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()

    typePin('9999')

    await act(async () => {
      clickSubmit()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('PIN incorrecto.')
    }, { timeout: 5000 })

    expect(screen.queryByText(/Te quedan/)).toBeNull()
  })

  it('does not show warning when attemptsLeft is undefined', async () => {
    mockCheck.mockResolvedValue(false)

    const noWarnResult: VerifyPinResult = {
      ok: false,
      locked: false,
      error: 'PIN incorrecto.',
    }
    mockVerify.mockResolvedValue(noWarnResult)

    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()

    typePin('9999')

    await act(async () => {
      clickSubmit()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('PIN incorrecto.')
    }, { timeout: 5000 })

    expect(screen.queryByText(/Te quedan/)).toBeNull()
  })
})

describe('PinGate — success path', () => {
  it('renders children after successful PIN verification', async () => {
    mockCheck.mockResolvedValue(false)
    mockVerify.mockResolvedValue({ ok: true })

    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()

    typePin('1234')

    await act(async () => {
      clickSubmit()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('SECRET')).toBeTruthy()
    }, { timeout: 5000 })

    expect(screen.queryByLabelText('PIN')).toBeNull()
  })

  it('calls router.refresh() after successful verification (#9)', async () => {
    mockCheck.mockResolvedValue(false)
    mockVerify.mockResolvedValue({ ok: true })

    render(<PinGate><div>SECRET</div></PinGate>)
    await waitForForm()

    typePin('1234')

    await act(async () => {
      clickSubmit()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('SECRET')).toBeTruthy()
    }, { timeout: 5000 })

    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('renders children immediately when session already active', async () => {
    mockCheck.mockResolvedValue(true)

    render(<PinGate><div>SECRET</div></PinGate>)

    await waitFor(() => {
      expect(screen.getByText('SECRET')).toBeTruthy()
    })

    expect(screen.queryByLabelText('PIN')).toBeNull()
  })
})
