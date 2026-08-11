import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
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
type FakeSubscription = { endpoint: string }
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

/** Sin suscripción previa (`getRegistration` no encuentra nada): aparece el prompt. */
export const SinSuscribir: Story = {
  beforeEach: () => {
    getRegistrationSpy = fn(async () => undefined)
    return stubPushApis({
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('¿Habilitar notificaciones?')).toBeVisible()
    const button = canvas.getByRole('button', { name: 'Habilitar notificaciones' })
    await expect(button).toBeVisible()
    await expect(button).not.toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Cerrar' })).toBeVisible()
    // Scope '/' (no '/admin/'): `(admin)` es un route group de Next, no aparece
    // en la URL — ver el comment de SW_SCOPE en PushNotificationManager.tsx y
    // el fix adb1729 ("el destino de las notificaciones apuntaba a un 404").
    await expect(getRegistrationSpy).toHaveBeenCalledWith('/')
  },
}

// Debe reflejar DISMISS_KEY de PushNotificationManager.tsx (no se exporta, mismo
// patrón que SOUND_ENABLED_KEY: ninguna story de este archivo importa internals).
const DISMISS_KEY = 'turnogol:notif-banner-dismissed-at'

/**
 * ENS-11: el botón "Cerrar" (X) desmonta el banner por completo — no lo
 * oculta con `visibility`/`display` — así no queda residuo interceptando
 * clicks de botones reales debajo suyo. La persistencia real en `localStorage`
 * (timestamp + ventana de 7 días) se cubre en
 * `tests/unit/push-notification-dismiss.test.tsx`; este `play` corre en un
 * browser real (Playwright) donde `localStorage` persiste entre stories del
 * mismo archivo, así que limpia `DISMISS_KEY` antes (por si una corrida
 * previa quedó a mitad) y después (para no contaminar `Pendiente` /
 * `YaSuscripto`, que también esperan ver el banner al montar).
 */
export const Descartado: Story = {
  beforeEach: () => {
    localStorage.removeItem(DISMISS_KEY)
    getRegistrationSpy = fn(async () => undefined)
    const restorePushApis = stubPushApis({
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
    return () => {
      restorePushApis()
      localStorage.removeItem(DISMISS_KEY)
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const closeButton = await canvas.findByRole('button', { name: 'Cerrar' })
    await userEvent.click(closeButton)
    await expect(canvas.queryByText('¿Habilitar notificaciones?')).not.toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: 'Habilitar notificaciones' }),
    ).not.toBeInTheDocument()
  },
}

/**
 * Click en "Habilitar": el botón pasa a deshabilitado con label "Habilitando…"
 * de inmediato (`setStatus('pending')` es la primera línea de `enable()`,
 * antes de cualquier `await`). `requestPermission` se stubea para resolver
 * `'default'` (el usuario cierra/ignora el diálogo del navegador) a los 80ms:
 * ese camino de `enable()` vuelve a `setStatus('unsubscribed')` SIN llamar a
 * `toast(...)` (a diferencia de cualquier falla más adelante — registro de SW,
 * VAPID, subscribe — que sí dispara un toast). Se elige a propósito para no
 * dejar un toast vivo en el `<Toaster />` global (module-level, compartido
 * entre stories): un toast así sobrevive a esta story y contamina el DOM que
 * ve el scan de a11y de la SIGUIENTE (comprobado empíricamente — un toast
 * "destructive" quedaba a mitad de la animación de cierre, con contraste real
 * pero de un componente ajeno, y rompía `YaSuscripto`).
 *
 * El `play` espera a que el botón se recupere antes de terminar, para no dejar
 * la promesa de `requestPermission` resolviéndose después de que este test
 * ya haya cerrado.
 */
export const Pendiente: Story = {
  beforeEach: () =>
    stubPushApis({
      getRegistration: async () => undefined,
      requestPermission: () =>
        new Promise<NotificationPermission>((resolve) => {
          setTimeout(() => resolve('default'), 80)
        }),
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'Habilitar notificaciones' })
    await userEvent.click(button)
    const pendingButton = await canvas.findByRole('button', { name: 'Habilitando…' })
    await expect(pendingButton).toBeDisabled()
    const recoveredButton = await canvas.findByRole('button', { name: 'Habilitar notificaciones' })
    await expect(recoveredButton).not.toBeDisabled()
  },
}

/** Ya suscripto (`getSubscription()` devuelve una suscripción existente): sin prompt ni botón. */
export const YaSuscripto: Story = {
  beforeEach: () => {
    getRegistrationSpy = fn(async () => ({
      pushManager: {
        getSubscription: async () => ({ endpoint: 'https://fcm.googleapis.com/fake/abc123' }),
      },
    }))
    return stubPushApis({
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Scope '/' (no '/admin/'): ver comment en la story SinSuscribir.
    await expect(getRegistrationSpy).toHaveBeenCalledWith('/')
    await expect(canvas.queryByText('¿Habilitar notificaciones?')).not.toBeInTheDocument()
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
 * Permiso denegado por el usuario (`Notification.permission === 'denied'`
 * desde el arranque): el efecto corta ANTES de tocar `serviceWorker` —
 * `getRegistration` nunca se llama. Sin prompt ni botón.
 */
export const PermisoDenegado: Story = {
  beforeEach: () => {
    getRegistrationSpy = fn(async () => undefined)
    return stubPushApis({
      permission: 'denied',
      getRegistration: getRegistrationSpy as PushApiOverrides['getRegistration'],
    })
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('¿Habilitar notificaciones?')).not.toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: 'Habilitar notificaciones' }),
    ).not.toBeInTheDocument()
    await expect(getRegistrationSpy).not.toHaveBeenCalled()
  },
}
