// @vitest-environment happy-dom
/**
 * Modal y cartel de permiso del panel (decisión 2026-11-16,
 * docs/decisions/2026-11-16-push-urgente-permiso-y-recordatorio-jugador.md):
 * - el modal se abre solo una vez por dispositivo y por situación;
 * - el cartel se cierra con la X y vuelve a los 7 días (decisión 2026-11-17);
 * - si el dispositivo ya recibe avisos, no se muestra nada.
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

const MODAL_SEEN_KEY = 'turnogol:notif-modal-seen:unsubscribed'
const DISMISSED_KEY = 'turnogol:notif-modal-seen:banner-dismissed'
const BANNER_TEXT = 'No tenés las notificaciones activadas en este dispositivo.'

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
  ;(Notification as unknown as { permission: string }).permission = 'default'
  ;(
    navigator.serviceWorker as unknown as { getRegistration: ReturnType<typeof vi.fn> }
  ).getRegistration = vi.fn().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('PushNotificationManager — modal y cartel de permiso', () => {
  it('la primera vez abre el modal propio, sin pedir el permiso del navegador', async () => {
    await act(async () => {
      render(<PushNotificationManager />)
    })

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText('Activá las notificaciones')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Habilitar notificaciones' })).not.toBeDisabled()
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(localStorageMock.getItem(MODAL_SEEN_KEY)).not.toBeNull()
  })

  it('el botón del modal recién ahí pide el permiso del dispositivo', async () => {
    ;(Notification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('default')
    await act(async () => {
      render(<PushNotificationManager />)
    })
    const enable = await screen.findByRole('button', { name: 'Habilitar notificaciones' })
    await act(async () => {
      fireEvent.click(enable)
    })
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('después de la primera vez no vuelve a abrir el modal: queda el cartel', async () => {
    localStorageMock.setItem(MODAL_SEEN_KEY, String(Date.now()))
    await act(async () => {
      render(<PushNotificationManager />)
    })

    expect(
      await screen.findByText('No tenés las notificaciones activadas en este dispositivo.'),
    ).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('la X oculta el cartel y lo recuerda por 7 días', async () => {
    localStorageMock.setItem(MODAL_SEEN_KEY, String(Date.now()))
    await act(async () => {
      render(<PushNotificationManager />)
    })
    await screen.findByText(BANNER_TEXT)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    })
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
    expect(localStorageMock.getItem(DISMISSED_KEY)).not.toBeNull()

    cleanup()
    await act(async () => {
      render(<PushNotificationManager />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('el cartel reaparece pasados los 7 días', async () => {
    localStorageMock.setItem(MODAL_SEEN_KEY, String(Date.now()))
    localStorageMock.setItem(DISMISSED_KEY, String(Date.now() - 8 * 24 * 60 * 60 * 1000))
    await act(async () => {
      render(<PushNotificationManager />)
    })
    expect(await screen.findByText(BANNER_TEXT)).toBeVisible()
  })

  it('con banner=false no renderiza el cartel', async () => {
    localStorageMock.setItem(MODAL_SEEN_KEY, String(Date.now()))
    await act(async () => {
      render(<PushNotificationManager banner={false} />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('el botón del cartel vuelve a abrir el modal', async () => {
    localStorageMock.setItem(MODAL_SEEN_KEY, String(Date.now()))
    await act(async () => {
      render(<PushNotificationManager />)
    })
    const open = await screen.findByRole('button', { name: 'Activar' })
    await act(async () => {
      fireEvent.click(open)
    })
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('con las notificaciones bloqueadas explica cómo desbloquearlas', async () => {
    ;(Notification as unknown as { permission: string }).permission = 'denied'
    await act(async () => {
      render(<PushNotificationManager />)
    })

    expect(await screen.findByText('Las notificaciones están bloqueadas')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Habilitar notificaciones' }),
    ).not.toBeInTheDocument()
  })

  it('si el dispositivo ya recibe avisos no muestra nada', async () => {
    ;(Notification as unknown as { permission: string }).permission = 'granted'
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/x',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    }
    ;(
      navigator.serviceWorker as unknown as { getRegistration: ReturnType<typeof vi.fn> }
    ).getRegistration = vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) },
    })
    await act(async () => {
      render(
        <PushNotificationManager
          actions={{
            subscribe: vi.fn().mockResolvedValue({ success: true, subscriptionId: 'sub-1' }),
            unsubscribe: vi.fn(),
            test: vi.fn(),
            status: vi.fn(),
          }}
        />,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/notificaciones/i)).not.toBeInTheDocument()
  })
})
