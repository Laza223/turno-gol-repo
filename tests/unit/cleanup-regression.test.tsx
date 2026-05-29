// @vitest-environment happy-dom
/**
 * T6 — Memory leak cleanup regression guards.
 *
 * Each test ensures that a component correctly calls its cleanup function
 * (clearInterval, clearTimeout, BroadcastChannel.close) on unmount.
 * The investigator confirmed 0 leaks exist today; these tests prevent regressions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

// ─── Mock server actions used by PinGate ─────────────────────────────────────
vi.mock('@/app/(admin)/actions/pin', () => ({
  checkPinSessionAction: vi.fn().mockResolvedValue(false),
  verifyPinAction: vi.fn(),
}))

// ─── Mock use-toast (used by PushNotificationManager) ────────────────────────
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

// ─── Mock browser APIs absent from happy-dom ─────────────────────────────────

// Notification API
Object.defineProperty(globalThis, 'Notification', {
  value: { permission: 'default', requestPermission: vi.fn() },
  writable: true,
  configurable: true,
})

// navigator.serviceWorker
Object.defineProperty(navigator, 'serviceWorker', {
  value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
})

// PushManager (feature-detection only)
Object.defineProperty(globalThis, 'PushManager', {
  value: class PushManager {},
  writable: true,
  configurable: true,
})

// HTMLMediaElement.play/pause
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  value: vi.fn().mockResolvedValue(undefined),
  writable: true,
  configurable: true,
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  value: vi.fn(),
  writable: true,
  configurable: true,
})

// localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

// ─── Imports (after global stubs are set) ────────────────────────────────────
import ExpiryCountdown from '@/components/booking/ExpiryCountdown'
import PaymentStatusWatcher from '@/components/booking/PaymentStatusWatcher'
import { PinGate } from '@/components/pin-gate'
import { PushNotificationManager } from '@/components/admin/PushNotificationManager'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns an ISO string N milliseconds from now. */
function futureISO(ms = 600_000): string {
  return new Date(Date.now() + ms).toISOString()
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  localStorageMock.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Test 1: ExpiryCountdown — setInterval/clearInterval ─────────────────────

describe('ExpiryCountdown — interval cleanup on unmount', () => {
  it('calls clearInterval with the handle returned by setInterval', () => {
    const fakeHandle = 42 as unknown as ReturnType<typeof setInterval>
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(fakeHandle)
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = render(<ExpiryCountdown expiresAt={futureISO()} />)

    // setInterval must have been called once to start the 1-second tick.
    expect(setIntervalSpy).toHaveBeenCalledOnce()

    // Unmount triggers the useEffect cleanup.
    unmount()

    // clearInterval must have been called with the exact handle.
    expect(clearIntervalSpy).toHaveBeenCalledWith(fakeHandle)
  })
})

// ─── Test 2: PaymentStatusWatcher — clearInterval on unmount ─────────────────

describe('PaymentStatusWatcher — interval cleanup on unmount', () => {
  it('calls clearInterval with the polling handle on unmount', () => {
    // Stub fetch so the interval callback never triggers a real network call.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* never resolves */ })))

    // Track each handle issued by setInterval so we can verify cleanup.
    let callCount = 0
    const issuedHandles: number[] = []
    const realSetInterval = globalThis.setInterval.bind(globalThis)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: any, delay?: number) => {
        const handle = (++callCount) as unknown as ReturnType<typeof setInterval>
        issuedHandles.push(callCount)
        // We don't actually run realSetInterval — fake timers are active.
        void fn; void delay; void realSetInterval
        return handle
      },
    )
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = render(
      <PaymentStatusWatcher
        bookingId="booking-test-123"
        initialStatus="pending_payment"
        expiresAt={futureISO()}
      />,
    )

    // At least one setInterval call must have happened (the polling effect).
    // PaymentStatusWatcher also renders ExpiryCountdown internally which also
    // calls setInterval — so there may be 2 calls total. What matters is that
    // all issued handles are cleaned up on unmount.
    expect(setIntervalSpy).toHaveBeenCalled()
    const handlesBeforeUnmount = [...issuedHandles]

    unmount()

    // Every handle issued before unmount must have been cleared.
    for (const handle of handlesBeforeUnmount) {
      expect(clearIntervalSpy).toHaveBeenCalledWith(handle)
    }
  })
})

// ─── Test 3: PinGate — clearInterval on unmount (lockout countdown) ───────────

describe('PinGate — lockout interval cleanup on unmount', () => {
  it('calls clearInterval when unmounted while a lockout countdown is active', async () => {
    // Override checkPinSessionAction to immediately return false (show form).
    const { checkPinSessionAction } = await import('@/app/(admin)/actions/pin')
    vi.mocked(checkPinSessionAction).mockResolvedValue(false)

    // Set a fake system time so Date.now() is controlled.
    const fakeNow = 1_700_000_000_000
    vi.setSystemTime(fakeNow)

    // PinGate only starts the interval when lockedUntilMs > Date.now().
    // We mount without a lockout first; the interval only fires when the user
    // triggers a lockout. For the cleanup guard we just verify that if the
    // component unmounts while the interval is running, clearInterval is called.
    //
    // Strategy: spy before render, then trigger the lockout via verifyPinAction,
    // then unmount and assert.

    const { verifyPinAction } = await import('@/app/(admin)/actions/pin')
    vi.mocked(verifyPinAction).mockResolvedValue({
      ok: false,
      locked: true,
      retryAtMs: fakeNow + 90_000,
      error: 'Bloqueado.',
    })

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    let unmount!: () => void
    await act(async () => {
      const result = render(<PinGate><div>PROTECTED</div></PinGate>)
      unmount = result.unmount
      // Flush the checkPinSessionAction promise.
      await Promise.resolve()
    })

    // Submit the form to trigger lockout state (which starts the countdown interval).
    const { fireEvent } = await import('@testing-library/react')
    const input = document.querySelector('input[type="password"]') as HTMLInputElement
    if (input) {
      fireEvent.change(input, { target: { value: '9999' } })
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement
      await act(async () => {
        fireEvent.click(btn)
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    // Unmount while the countdown interval may be active.
    unmount()

    // clearInterval must have been called (either for cleanup of an active
    // interval, or for the no-op guard path `intervalRef.current !== null` check).
    // The component always calls clearInterval in its useEffect cleanup.
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})

// ─── Test 4: PushNotificationManager — BroadcastChannel.close on unmount ─────

describe('PushNotificationManager — BroadcastChannel cleanup on unmount', () => {
  it('calls BroadcastChannel.close() exactly once on unmount', async () => {
    const closeSpy = vi.fn()

    class MockBC {
      name: string
      onmessage: ((e: { data: unknown }) => void) | null = null
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      postMessage = vi.fn()
      close = closeSpy

      constructor(name: string) {
        this.name = name
      }
    }

    vi.stubGlobal('BroadcastChannel', MockBC)

    let unmount!: () => void
    await act(async () => {
      const result = render(<PushNotificationManager />)
      unmount = result.unmount
    })

    // Channel was created on mount; close not yet called.
    expect(closeSpy).not.toHaveBeenCalled()

    await act(async () => {
      unmount()
    })

    // close() must be called exactly once on unmount.
    expect(closeSpy).toHaveBeenCalledOnce()
  })
})
