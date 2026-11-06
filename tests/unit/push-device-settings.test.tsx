// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PushNotificationManager } from '@/components/admin/PushNotificationManager'
import {
  disableCurrentPush,
  syncPushSubscription,
  type PushDeviceActions,
} from '@/components/admin/push-browser'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const [target, key, descriptor] of [
    [navigator, 'serviceWorker', originalServiceWorker],
    [document, 'visibilityState', originalVisibility],
  ] as const) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else delete (target as unknown as Record<string, unknown>)[key]
  }
})

function setup(permission: NotificationPermission = 'granted') {
  const unsubscribe = vi.fn().mockResolvedValue(true)
  const sub = {
    endpoint: 'https://web.push.apple.com/device',
    toJSON: () => ({
      endpoint: 'https://web.push.apple.com/device',
      keys: { p256dh: 'key', auth: 'auth' },
    }),
    unsubscribe,
  } as unknown as PushSubscription
  const registration = {
    update: vi.fn().mockResolvedValue(undefined),
    pushManager: { getSubscription: vi.fn().mockResolvedValue(sub) },
  }
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue('granted'),
  })
  vi.stubGlobal('PushManager', class {})
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    configurable: true,
  })
  const actions: PushDeviceActions = {
    subscribe: vi.fn().mockResolvedValue({ success: true, subscriptionId: 'sub-1' }),
    unsubscribe: vi.fn().mockResolvedValue({ success: true }),
    test: vi.fn().mockResolvedValue({ success: true }),
    status: vi
      .fn()
      .mockResolvedValue({ success: true, acceptedAt: null, processedAt: null, openedAt: null }),
  }
  return { sub, registration, actions, unsubscribe }
}

describe('Notificaciones de este dispositivo', () => {
  it('no afirma estar activo si el servidor no pudo guardar la suscripción local', async () => {
    const { actions, registration } = setup()
    vi.mocked(actions.subscribe).mockResolvedValue({ success: false, error: 'sin conexión' })
    await act(async () => {
      render(<PushNotificationManager settings actions={actions} />)
    })
    expect(await screen.findByRole('button', { name: 'Habilitar notificaciones' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Probar en este teléfono' }),
    ).not.toBeInTheDocument()
    expect(registration.update).toHaveBeenCalledOnce()
  })

  it('vuelve a guardar la suscripción al recuperar visibilidad', async () => {
    const { actions } = setup()
    await act(async () => {
      render(<PushNotificationManager settings actions={actions} />)
    })
    await screen.findByRole('button', { name: 'Probar en este teléfono' })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(actions.subscribe).toHaveBeenCalledTimes(2)
  })

  it('explica cómo recuperar un permiso bloqueado', async () => {
    const { actions, unsubscribe } = setup('denied')
    await act(async () => {
      render(<PushNotificationManager settings actions={actions} />)
    })
    expect(await screen.findByText(/Las notificaciones están bloqueadas/)).toBeVisible()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('iPhone sin instalación muestra instrucciones y no pide permiso', async () => {
    const { actions } = setup()
    const userAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
    try {
      await act(async () => {
        render(<PushNotificationManager settings actions={actions} />)
      })
      expect(await screen.findByText(/En iPhone o iPad necesitás iOS 16.4/)).toBeVisible()
      expect(Notification.requestPermission).not.toHaveBeenCalled()
      expect(actions.subscribe).not.toHaveBeenCalled()
    } finally {
      if (userAgent) Object.defineProperty(navigator, 'userAgent', userAgent)
      else delete (navigator as unknown as Record<string, unknown>).userAgent
    }
  })

  it('revoca localmente aunque falle la desuscripción remota', async () => {
    const { actions, unsubscribe } = setup()
    vi.mocked(actions.unsubscribe).mockRejectedValue(new Error('offline'))
    await expect(disableCurrentPush(actions)).rejects.toThrow('offline')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('no conserva una suscripción que el servidor rechaza por otra identidad', async () => {
    const { sub, unsubscribe } = setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 403, ok: false }))
    await expect(syncPushSubscription(sub)).resolves.toBeNull()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('consulta sólo el envío de prueba aunque llegue otra notificación a la vez', async () => {
    const { actions } = setup()
    vi.mocked(actions.test).mockResolvedValue({
      success: true,
      notificationId: 'test-notification',
    })
    vi.mocked(actions.status).mockImplementation(async (...args: unknown[]) => ({
      success: true,
      acceptedAt: null,
      processedAt: args[1] === 'test-notification' ? null : new Date().toISOString(),
      openedAt: null,
    }))
    await act(async () => {
      render(<PushNotificationManager settings actions={actions} />)
    })
    const button = await screen.findByRole('button', { name: 'Probar en este teléfono' })
    vi.useFakeTimers()
    try {
      await act(async () => {
        button.click()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(actions.status).toHaveBeenCalledWith('sub-1', 'test-notification')
      expect(screen.queryByText(/procesó.*prueba/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
