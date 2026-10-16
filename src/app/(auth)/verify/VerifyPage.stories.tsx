import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { VerifyView } from './VerifyView'

/**
 * Monta `VerifyView`, no el `export default` de page.tsx: en Next 16
 * `searchParams` es una Promise, así que la page es async — y un componente
 * async no se puede montar en el cliente ("Only Server Components can be async
 * at the moment"). La page resuelve la Promise y delega en `VerifyView`, que es
 * sincrónico y es lo que se testea acá. La Server Action de Google entra por
 * prop (`googleAction`): importarla como valor rompe el bundle de Storybook.
 *
 * 100% presentacional: toda la lógica sale de `searchParams`, sin fetch ni auth
 * (ver isolationNotes en docs/storybook/storybook-coverage.json). El estado `success` monta
 * <SuccessRedirect/> (client), que agenda un `window.location.assign(next)`
 * real a los 5s. No se stubea: `assign`/`replace`/`reload` son [Unforgeable]
 * en Location (own-property no configurable) — en un browser real (Playwright,
 * a diferencia de jsdom) NO se pueden espiar ni en la instancia ni en
 * `Location.prototype` (ahí ni siquiera existen como own property). El `play`
 * corre y desmonta en <100ms, muy por debajo del timeout de 5s, y el `useEffect`
 * de cleanup de <SuccessRedirect/> cancela el timer al desmontar la story.
 */
const meta = {
  title: 'Auth/VerifyPage',
  component: VerifyView,
  args: { googleAction: fn(async () => {}) },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof VerifyView>

export default meta
type Story = StoryObj<typeof meta>

// Solo los estados del jugador montan el mundo del portal; los del staff siguen con su marco oscuro.
const inPortalWorld = (root: HTMLElement) => root.querySelector('[data-world="portal"]') !== null

export const Cargando: Story = {
  args: { searchParams: {} },
}

export const ExitoLogin: Story = {
  args: { searchParams: { status: 'success', intent: 'login', next: '/mis-reservas' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Listo!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ir a mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
    await expect(inPortalWorld(canvasElement)).toBe(true)
  },
}

export const ExitoSignup: Story = {
  args: { searchParams: { status: 'success', intent: 'signup', next: '/dashboard' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Bienvenido a TurnoGol!')).toBeInTheDocument()
    await expect(inPortalWorld(canvasElement)).toBe(false)
  },
}

export const ExitoBooking: Story = {
  args: {
    searchParams: { status: 'success', intent: 'booking', next: '/complejo-fenix/reservar' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Cuenta confirmada!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Continuar con mi reserva' })).toBeInTheDocument()
  },
}

/** Sin `via` no sabemos si es un jugador o un link de staff (alta, invitación…): primero el panel. */
export const ErrorExpirado: Story = {
  args: { searchParams: { error: 'expired' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Este enlace venció' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    )
    await expect(canvas.getByRole('link', { name: 'Ingresá acá' })).toHaveAttribute(
      'href',
      '/ingresar',
    )
    await expect(inPortalWorld(canvasElement)).toBe(false)
  },
}

/** Con `via` lo pidió un jugador: el reintento es el suyo. */
export const ErrorExpiradoJugador: Story = {
  args: { searchParams: { error: 'expired', via: 'email' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/ingresar',
    )
    await expect(canvas.getByRole('link', { name: 'Entrá al panel' })).toHaveAttribute(
      'href',
      '/login',
    )
    await expect(inPortalWorld(canvasElement)).toBe(true)
  },
}

/** Google cancelado: el reintento vuelve a /ingresar conservando el destino. */
export const GoogleCancelado: Story = {
  args: {
    searchParams: { error: 'oauth_cancelled', via: 'google', next: '/complejo-fenix/reservar' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Cancelaste el ingreso con Google' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('alert')).toHaveTextContent('No pasó nada')
    await expect(canvas.getByRole('link', { name: 'Volver a intentar' })).toHaveAttribute(
      'href',
      '/ingresar?next=%2Fcomplejo-fenix%2Freservar',
    )
    await expect(inPortalWorld(canvasElement)).toBe(true)
  },
}

export const ErrorInvalido: Story = {
  args: { searchParams: { error: 'algo-no-mapeado' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Código sin entrada en ERROR_COPY: cae al copy de 'invalid' (fallback).
    await expect(
      canvas.getByRole('heading', { name: 'No pudimos leer el enlace' }),
    ).toBeInTheDocument()
  },
}

/** Las cuentas de jugador y de complejo están separadas: se explica y se ofrece otra. */
export const ConflictoGoogle: Story = {
  args: {
    searchParams: { error: 'account_conflict', via: 'google', next: '/complejo-fenix/reservar' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Esta cuenta de Google ya la usa un complejo' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Usar otra cuenta de Google' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Entrar con mi email' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Entrá al panel' })).toHaveAttribute(
      'href',
      '/login',
    )
  },
}

export const ConflictoEmail: Story = {
  args: { searchParams: { error: 'account_conflict', via: 'email' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Este email ya lo usa un complejo' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Usar otro email' })).toHaveAttribute(
      'href',
      '/ingresar',
    )
  },
}
