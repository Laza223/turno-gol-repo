import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { PushNotificationManager } from './PushNotificationManager'

/**
 * `PushNotificationManager` decide su estado inicial en un `useEffect` que
 * corre apenas monta (feature-detect + `Notification.permission` +
 * `navigator.serviceWorker.getRegistration()`). Un stub aplicado en un
 * `useEffect` de un decorator correría DESPUÉS de ese efecto (los efectos de
 * React corren de adentro hacia afuera) — demasiado tarde. Por eso el stub se
 * instala en `beforeEach`, que corre antes de que Storybook monte el árbol:
 * el mismo patrón que resuelve `Reveal.stories.tsx` para su
 * IntersectionObserver + matchMedia.
 *
 * Corre en Chromium real (Playwright), no jsdom/happy-dom: `Notification`,
 * `navigator.serviceWorker` y `window.PushManager` YA existen como APIs
 * nativas del browser. Igual se reemplazan por completo (no se parchea un
 * método suelto) para que el registro de un service worker real, un permiso
 * realmente pedido al SO, o una key VAPID inventada nunca lleguen a la red —
 * cada story queda determinista y no muta el estado real del browser del
 * runner.
 */
type FakeSubscription = {
  endpoint: string
  toJSON?: () => { endpoint: string; keys: { p256dh: string; auth: string } }
}
type FakeRegistration = {
  pushManager: { getSubscription: () => Promise<FakeSubscription | undefined> }
}

type PushApiOverrides = {
  permission?: NotificationPermission
  requestPermission?: () => Promise<NotificationPermission>
  getRegistration?: () => Promise<FakeRegistration | undefined>
  register?: () => Promise<unknown>
}

function stubPushApis(overrides: PushApiOverrides = {}) {
  const origNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification')
  const origPushManager = Object.getOwnPropertyDescriptor(globalThis, 'PushManager')
  const origServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

  Object.defineProperty(globalThis, 'Notification', {
    value: {
      permission: overrides.permission ?? 'default',
      requestPermission:
        overrides.requestPermission ?? (async () => 'default' as NotificationPermission),
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'PushManager', {
    value: class {},
    writable: true,
    configurable: true,
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      getRegistration: overrides.getRegistration ?? (async () => undefined),
      register: overrides.register ?? (async () => undefined),
    },
    writable: true,
    configurable: true,
  })

  return () => {
    function restore(obj: object, prop: string, desc: PropertyDescriptor | undefined) {
      if (desc) Object.defineProperty(obj, prop, desc)
      else delete (obj as Record<string, unknown>)[prop]
    }
    restore(globalThis, 'Notification', origNotification)
    restore(globalThis, 'PushManager', origPushManager)
    restore(navigator, 'serviceWorker', origServiceWorker)
  }
}

const meta = {
  title: 'Admin/Layout/PushNotificationManager',
  component: PushNotificationManager,
  parameters: { layout: 'fullscreen' },
  args: {
    // Storybook restaura los mocks antes de cada story: conservar la respuesta
    // como implementación inicial, también al resincronizar una suscripción.
    actions: {
      subscribe: fn(async () => ({ success: true as const, subscriptionId: 'story-device' })),
      unsubscribe: fn(async () => ({ success: true as const })),
      test: fn(async () => ({ success: true as const })),
      status: fn(async () => ({
        success: true as const,
        acceptedAt: null,
        processedAt: null,
        openedAt: null,
      })),
    },
  },
  decorators: [
    // `fixed bottom-[...] left-4` escapa al viewport del canvas sin un
    // containing block propio — mismo truco que admin-header/admin-sidebar.
    (Story) => (
      <div
        style={{ transform: 'translateZ(0)', height: 320 }}
        className="relative isolate overflow-hidden"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PushNotificationManager>

export default meta
type Story = StoryObj<typeof meta>

/** Spy compartido: se reasigna en el `beforeEach` de cada story y se lee en su `play`. */
let getRegistrationSpy: ReturnType<typeof fn>

// Deben reflejar MODAL_SEEN_KEY de PushNotificationManager.tsx. En el browser real
// de Storybook `localStorage` persiste entre stories: cada story limpia lo suyo.
const SEEN_UNSUBSCRIBED = 'turnogol:notif-modal-seen:unsubscribed'
const SEEN_DENIED = 'turnogol:notif-modal-seen:denied'
function clearSeen() {
  localStorage.removeItem(SEEN_UNSUBSCRIBED)
  localStorage.removeItem(SEEN_DENIED)
}

/**
 * Primera vez en el panel, sin suscripción: se abre el modal propio. El diálogo
 * del navegador NO se pide hasta tocar "Habilitar notificaciones". El modal vive
 * en un portal, por eso se busca en `document.body` y no en el canvas.
 */
export const SinSuscribir: Story = {
  beforeEach: () => {
    clearSeen()
    getRegistrationSpy = fn(async () => undefined)
    const restore = stubPushApis({
      permission: 'granted',
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
    return () => {
      restore()
      clearSeen()
    }
  },
  play: async () => {
    const body = within(document.body)
    // El diálogo entra con fade: visible recién al terminar la animación.
    await waitFor(() => expect(body.getByText('Activá las notificaciones')).toBeVisible())
    const button = body.getByRole('button', { name: 'Habilitar notificaciones' })
    await expect(button).not.toBeDisabled()
    // Scope '/' (no '/admin/'): `(admin)` es un route group de Next, no aparece
    // en la URL — ver el comment de SW_SCOPE en PushNotificationManager.tsx.
    await expect(getRegistrationSpy).toHaveBeenCalledWith('/')
    await userEvent.click(body.getByRole('button', { name: 'Ahora no' }))
  },
}

/** Ya vio el modal en este dispositivo: queda el cartel, sin "Cerrar", que lo vuelve a abrir. */
export const CartelSinActivar: Story = {
  beforeEach: () => {
    localStorage.setItem(SEEN_UNSUBSCRIBED, String(Date.now()))
    const restore = stubPushApis({ getRegistration: async () => undefined })
    return () => {
      restore()
      clearSeen()
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No tenés las notificaciones activadas en este dispositivo.'),
    ).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Activar' }))
    const body = within(document.body)
    // El diálogo entra con fade: visible recién al terminar la animación.
    await waitFor(() => expect(body.getByText('Activá las notificaciones')).toBeVisible())
    await userEvent.click(body.getByRole('button', { name: 'Ahora no' }))
  },
}

/**
 * Click en "Habilitar": el botón pasa a "Habilitando…" de inmediato y
 * `requestPermission` resuelve `'default'` (cerró el diálogo del navegador) a
 * los 80ms. Ese camino no dispara toast (un toast vivo contamina el scan de a11y
 * de la story siguiente): el modal se cierra y queda el cartel con "Activar".
 */
export const Pendiente: Story = {
  beforeEach: () => {
    clearSeen()
    const restore = stubPushApis({
      getRegistration: async () => undefined,
      requestPermission: () =>
        new Promise<NotificationPermission>((resolve) => {
          setTimeout(() => resolve('default'), 80)
        }),
    })
    return () => {
      restore()
      clearSeen()
    }
  },
  play: async ({ canvasElement }) => {
    const body = within(document.body)
    const button = await body.findByRole('button', { name: 'Habilitar notificaciones' })
    await userEvent.click(button)
    await expect(await body.findByRole('button', { name: 'Habilitando…' })).toBeDisabled()
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Activar' })).not.toBeDisabled()
  },
}

/** Ya suscripto (`getSubscription()` devuelve una suscripción existente): sin prompt ni botón. */
export const YaSuscripto: Story = {
  beforeEach: () => {
    getRegistrationSpy = fn(async () => ({
      pushManager: {
        getSubscription: async () => ({
          endpoint: 'https://fcm.googleapis.com/fake/abc123',
          toJSON: () => ({
            endpoint: 'https://fcm.googleapis.com/fake/abc123',
            keys: { p256dh: 'x'.repeat(88), auth: 'x'.repeat(24) },
          }),
        }),
      },
    }))
    return stubPushApis({
      permission: 'granted',
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Scope '/' (no '/admin/'): ver comment en la story SinSuscribir.
    await expect(getRegistrationSpy).toHaveBeenCalledWith('/')
    await expect(meta.args.actions.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fake/abc123' }),
    )
    await expect(meta.args.actions.subscribe.mock.results.at(-1)?.value).resolves.toEqual({
      success: true,
      subscriptionId: 'story-device',
    })
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    await expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument()
    // Scopeado al botón del propio componente (no `queryByRole('button')` a
    // secas): el `<Toaster />` global del preview puede tener un toast ajeno
    // en camino de desmontarse (dismiss + 200ms de animación, ver
    // use-toast.ts) con su propio botón "Cerrar" — no es parte de este
    // componente.
    await expect(
      canvas.queryByRole('button', { name: 'Habilitar notificaciones' }),
    ).not.toBeInTheDocument()
  },
}

/**
 * Permiso denegado desde el arranque: se revisa el SW para revocar la
 * suscripción vieja y el modal explica cómo desbloquear. No hay botón
 * "Habilitar": el navegador ya no deja volver a pedir el permiso.
 */
export const PermisoDenegado: Story = {
  beforeEach: () => {
    clearSeen()
    getRegistrationSpy = fn(async () => undefined)
    const restore = stubPushApis({
      permission: 'denied',
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
    return () => {
      restore()
      clearSeen()
    }
  },
  play: async () => {
    const body = within(document.body)
    // El diálogo entra con fade: visible recién al terminar la animación.
    await waitFor(() => expect(body.getByText('Las notificaciones están bloqueadas')).toBeVisible())
    await expect(
      body.queryByRole('button', { name: 'Habilitar notificaciones' }),
    ).not.toBeInTheDocument()
    await expect(getRegistrationSpy).toHaveBeenCalledWith('/')
    await userEvent.click(body.getByRole('button', { name: 'Ahora no' }))
  },
}
