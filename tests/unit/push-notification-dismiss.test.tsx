// @vitest-environment happy-dom
/**
 * Tests for PushNotificationManager's dismiss ("X") behavior.
 *
 * ENS-11: el banner "¿Habilitar notificaciones?" no tenía forma de
 * descartarlo — un elementFromPoint real en producción mostró que el div
 * fixed (bottom-4 left-4) intercepta clicks de botones reales debajo suyo.
 * El fix agrega un botón de cierre que persiste el descarte en localStorage
 * (con timestamp) y desmonta el banner por 7 días, sin dejar residuo en el
 * DOM (no `visibility:hidden` — el div deja de renderizarse por completo).
 *
 * Mismo patrón de mocks que push-broadcast-dedupe.test.tsx: Notification /
 * PushManager / navigator.serviceWorker no existen en happy-dom, y
 * localStorage se reemplaza por un fake en memoria controlable entre tests.
 */
import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

// ─── localStorage mock (IIFE — no global side-effects here) ──────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = val
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

// ─── Capture original descriptors before patching ────────────────────────────
const origNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification')
const origPushManager = Object.getOwnPropertyDescriptor(globalThis, 'PushManager')
const origLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const origServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const origPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play')
const origPause = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'pause')

beforeAll(() => {
  Object.defineProperty(globalThis, 'Notification', {
    value: { permission: 'default', requestPermission: vi.fn() },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'PushManager', {
    value: class {},
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
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
  restore(globalThis, 'localStorage', origLocalStorage)
  restore(navigator, 'serviceWorker', origServiceWorker)
  restore(HTMLMediaElement.prototype, 'play', origPlay)
  restore(HTMLMediaElement.prototype, 'pause', origPause)
})

// ─── Import the component AFTER globals are set up ────────────────────────────
import { PushNotificationManager } from '@/components/admin/PushNotificationManager'

const DISMISS_KEY = 'turnogol:notif-banner-dismissed-at'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
  ;(
    navigator.serviceWorker as unknown as { getRegistration: ReturnType<typeof vi.fn> }
  ).getRegistration = vi.fn().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('PushNotificationManager — descarte del banner', () => {
  it('muestra un botón de descarte accesible cuando el banner está visible', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    expect(await screen.findByText('¿Habilitar notificaciones?')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeVisible()
  })

  it('al descartar, desmonta el banner por completo (no deja residuo) y persiste el timestamp', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    await screen.findByText('¿Habilitar notificaciones?')
    const closeButton = screen.getByRole('button', { name: 'Cerrar' })

    const before = Date.now()
    await act(async () => {
      fireEvent.click(closeButton)
    })
    const after = Date.now()

    expect(screen.queryByText('¿Habilitar notificaciones?')).not.toBeInTheDocument()
    // Unmount real: el botón "Habilitar notificaciones" tampoco debe quedar en el DOM.
    expect(
      screen.queryByRole('button', { name: 'Habilitar notificaciones' }),
    ).not.toBeInTheDocument()

    const stored = Number(localStorageMock.getItem(DISMISS_KEY))
    expect(stored).toBeGreaterThanOrEqual(before)
    expect(stored).toBeLessThanOrEqual(after)
  })

  it('no vuelve a mostrar el banner si fue descartado hace menos de 7 días', async () => {
    localStorageMock.setItem(DISMISS_KEY, String(Date.now() - 1 * 24 * 60 * 60 * 1000)) // hace 1 día

    await act(async () => {
      render(<PushNotificationManager />)
    })

    // Dar tiempo al useEffect de detección (async) por si acaso.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(screen.queryByText('¿Habilitar notificaciones?')).not.toBeInTheDocument()
  })

  it('vuelve a mostrar el banner si el descarte tiene más de 7 días', async () => {
    localStorageMock.setItem(DISMISS_KEY, String(Date.now() - (SEVEN_DAYS_MS + 60_000))) // 7 días + 1 min

    await act(async () => {
      render(<PushNotificationManager />)
    })

    expect(await screen.findByText('¿Habilitar notificaciones?')).toBeVisible()
  })

  /**
   * R3-3: un timestamp GUARDADO EN EL FUTURO (reloj corrido del cliente, o el
   * valor de localStorage manipulado a mano) hacía que `Date.now() - dismissedAt`
   * diera negativo — siempre `< DISMISS_DURATION_MS` — así que el banner quedaba
   * descartado PARA SIEMPRE, sin ventana de 7 días que lo reactive. Un timestamp
   * futuro no es un descarte "reciente" válido: se trata como inválido.
   */
  it('vuelve a mostrar el banner si el timestamp guardado está en el futuro (reloj corrido o manipulado)', async () => {
    localStorageMock.setItem(DISMISS_KEY, String(Date.now() + 60_000)) // 1 min en el futuro

    await act(async () => {
      render(<PushNotificationManager />)
    })

    expect(await screen.findByText('¿Habilitar notificaciones?')).toBeVisible()
  })

  it('mantiene intacto el flujo de aceptar (el botón "Habilitar notificaciones" sigue funcionando)', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    const enableButton = await screen.findByRole('button', { name: 'Habilitar notificaciones' })
    expect(enableButton).toBeVisible()
    expect(enableButton).not.toBeDisabled()
  })
})
