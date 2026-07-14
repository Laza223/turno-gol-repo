import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import VerifyPage from './page'

/**
 * 100% presentacional pese a ser `page.tsx`: toda la lógica sale de
 * `searchParams`, sin fetch ni auth (ver isolationNotes en
 * docs/storybook/storybook-coverage.json). El estado `success` monta
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
  component: VerifyPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof VerifyPage>

export default meta
type Story = StoryObj<typeof meta>

export const Cargando: Story = {
  args: { searchParams: Promise.resolve({}) },
}

export const ExitoLogin: Story = {
  args: { searchParams: Promise.resolve({ status: 'success', intent: 'login', next: '/mis-reservas' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Listo!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ir a mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}

export const ExitoSignup: Story = {
  args: { searchParams: Promise.resolve({ status: 'success', intent: 'signup', next: '/dashboard' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Bienvenido a TurnoGol!')).toBeInTheDocument()
  },
}

export const ExitoBooking: Story = {
  args: { searchParams: Promise.resolve({ status: 'success', intent: 'booking', next: '/complejo-fenix/reservar' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Cuenta confirmada!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Continuar con mi reserva' })).toBeInTheDocument()
  },
}

export const ErrorExpirado: Story = {
  args: { searchParams: Promise.resolve({ error: 'expired' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Este enlace expiró. Generá uno nuevo desde Iniciar sesión.')).toBeInTheDocument()
  },
}

export const ErrorUsado: Story = {
  args: { searchParams: Promise.resolve({ error: 'used' }) },
}

export const ErrorInvalido: Story = {
  args: { searchParams: Promise.resolve({ error: 'algo-no-mapeado' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Código sin entrada en ERROR_COPY: cae al copy de 'invalid' (fallback).
    await expect(canvas.getByText('No pudimos verificar el enlace. Probá de nuevo.')).toBeInTheDocument()
  },
}
