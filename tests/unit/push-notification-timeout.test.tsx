// @vitest-environment happy-dom
/**
 * Regression tests for PushNotificationManager's "Habilitando…" hang.
 *
 * The bug: enable() set status to 'pending' and then awaited
 * `navigator.serviceWorker.ready` (and `Notification.requestPermission()`) with
 * no timeout. If the service worker never activates, the button stays stuck on
 * "Habilitando…" forever. These tests pin that the button always recovers.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

// ─── Capture originals so other test files aren't affected ───────────────────
const origNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification')
const origPushManager = Object.getOwnPropertyDescriptor(globalThis, 'PushManager')
const origServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const origPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play')
const origPause = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'pause')

// Configurable per-test handles.
let requestPermission: ReturnType<typeof vi.fn>
let readyPromise: Promise<unknown>

beforeAll(() => {
  Object.defineProperty(globalThis, 'PushManager', {
    value: class {},
    writable: true,
    configurable: true,
  })
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
})

afterAll(() => {
  function restore(obj: object, prop: string, desc: PropertyDescriptor | undefined) {
    if (desc) Object.defineProperty(obj, prop, desc)
    else delete (obj as Record<string, unknown>)[prop]
  }
  restore(globalThis, 'Notification', origNotification)
  restore(globalThis, 'PushManager', origPushManager)
  restore(navigator, 'serviceWorker', origServiceWorker)
  restore(HTMLMediaElement.prototype, 'play', origPlay)
  restore(HTMLMediaElement.prototype, 'pause', origPause)
})

beforeEach(() => {
  vi.clearAllMocks()
  requestPermission = vi.fn()
  // No existing registration → initial status resolves to 'unsubscribed', which
  // renders the enable button.
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      getRegistration: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      get ready() {
        return readyPromise
      },
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'Notification', {
    value: { permission: 'default', requestPermission },
    writable: true,
    configurable: true,
  })
})

// Always restore real timers so a failing test can never freeze the next one's
// Testing Library polling.
afterEach(() => {
  vi.useRealTimers()
})

import { PushNotificationManager } from '@/components/admin/PushNotificationManager'

async function renderAndGetEnableButton(): Promise<HTMLButtonElement> {
  await act(async () => {
    render(<PushNotificationManager />)
  })
  return (await screen.findByRole('button', {
    name: /habilitar notificaciones/i,
  })) as HTMLButtonElement
}

describe('PushNotificationManager — enable() never hangs', () => {
  it('recovers from a service worker that never activates (timeout)', async () => {
    requestPermission.mockResolvedValue('granted')
    readyPromise = new Promise(() => {}) // never resolves

    // Find the button with REAL timers — fake timers freeze Testing Library's
    // async polling, so we only switch them on for the click + advance.
    const btn = await renderAndGetEnableButton()

    vi.useFakeTimers()
    await act(async () => {
      btn.click()
    })
    // Mid-flight the button shows the pending label. (name-scoped: ENS-11 added
    // a second "Cerrar" button to the banner, so a bare getByRole is ambiguous.)
    expect(screen.getByRole('button', { name: /habilitando/i })).toBeTruthy()

    // Advance past the safety deadline: the SW-ready wait times out, enable()
    // catches it and clears the pending state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    vi.useRealTimers()

    // Assert synchronously (no waitFor) since state already settled.
    const recovered = screen.getByRole('button', {
      name: /habilitar notificaciones/i,
    }) as HTMLButtonElement
    expect(recovered.disabled).toBe(false)
  })

  it('recovers when the user dismisses the permission prompt (default)', async () => {
    requestPermission.mockResolvedValue('default')
    readyPromise = new Promise(() => {})

    const btn = await renderAndGetEnableButton()
    await act(async () => {
      btn.click()
    })

    // 'default' (dismissed) must not hide the button nor leave it pending — the
    // admin can try again.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /habilitar notificaciones/i })).toBeTruthy()
    })
    const recovered = screen.getByRole('button', {
      name: /habilitar notificaciones/i,
    }) as HTMLButtonElement
    expect(recovered.disabled).toBe(false)
  })
})
