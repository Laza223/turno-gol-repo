import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, spyOn, within } from 'storybook/test'
import VerifyPage from './page'

/**
 * 100% presentacional pese a ser `page.tsx`: toda la lógica sale de
 * `searchParams`, sin fetch ni auth (ver isolationNotes en
 * docs/storybook/storybook-coverage.json). El estado `success` monta
 * <SuccessRedirect/> (client), que agenda un `window.location.assign(next)`
 * real a los 5s — se stubea en el `play` para que el runner no navegue la
 * página real en medio de la suite.
 */
const meta = {
  title: 'Auth/VerifyPage',
  component: VerifyPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof VerifyPage>

export default meta
type Story = StoryObj<typeof meta>

export const Cargando: Story = {
  args: { searchParams: {} },
}

export const ExitoLogin: Story = {
  args: { searchParams: { status: 'success', intent: 'login', next: '/mis-reservas' } },
  play: async ({ canvasElement }) => {
    spyOn(window.location, 'assign').mockImplementation(() => {})
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Listo!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ir a mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}

export const ExitoSignup: Story = {
  args: { searchParams: { status: 'success', intent: 'signup', next: '/dashboard' } },
  play: async ({ canvasElement }) => {
    spyOn(window.location, 'assign').mockImplementation(() => {})
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Bienvenido a TurnoGol!')).toBeInTheDocument()
  },
}

export const ExitoBooking: Story = {
  args: { searchParams: { status: 'success', intent: 'booking', next: '/complejo-fenix/reservar' } },
  play: async ({ canvasElement }) => {
    spyOn(window.location, 'assign').mockImplementation(() => {})
    const canvas = within(canvasElement)
    await expect(canvas.getByText('¡Cuenta confirmada!')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Continuar con mi reserva' })).toBeInTheDocument()
  },
}

export const ErrorExpirado: Story = {
  args: { searchParams: { error: 'expired' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Este enlace expiró. Generá uno nuevo desde Iniciar sesión.')).toBeInTheDocument()
  },
}

export const ErrorUsado: Story = {
  args: { searchParams: { error: 'used' } },
}

export const ErrorInvalido: Story = {
  args: { searchParams: { error: 'algo-no-mapeado' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Código sin entrada en ERROR_COPY: cae al copy de 'invalid' (fallback).
    await expect(canvas.getByText('No pudimos verificar el enlace. Probá de nuevo.')).toBeInTheDocument()
  },
}
