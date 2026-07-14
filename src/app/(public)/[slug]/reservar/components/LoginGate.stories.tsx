import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import LoginGate from './LoginGate'

/**
 * `action` entra por prop (mismo patrón que ConfirmBookingButton): '../actions'
 * es `'use server'` y arrastra `node:async_hooks` si se importa como valor.
 */
const meta = {
  title: 'Player/Checkout/LoginGate',
  component: LoginGate,
  parameters: { layout: 'padded' },
  args: { next: '/complejo-fenix/reservar?court=101&date=2026-03-14&time=18:00&dur=60' },
  decorators: [
    (Story) => (
      <ReservaDarkShell>
        <div className="mx-auto max-w-md px-4 py-6">
          <Story />
        </div>
      </ReservaDarkShell>
    ),
  ],
} satisfies Meta<typeof LoginGate>

export default meta
type Story = StoryObj<typeof meta>

/** Form inicial: nombre, apellido, email y declaración jurada +18. */
export const Default: Story = {
  args: { action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Nombre')).toBeRequired()
    await expect(canvas.getByLabelText('Email')).toBeRequired()
    await expect(canvas.getByRole('checkbox')).toBeRequired()
  },
}

/** Envío exitoso: pide revisar el email para confirmar la reserva vía Magic Link. */
export const EmailEnviado: Story = {
  args: {
    action: fn(async () => ({ status: 'sent' as const, email: 'tomas.ibanez@example.com' })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Tomás')
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas.ibanez@example.com')
    await userEvent.click(canvas.getByRole('checkbox'))
    await userEvent.click(canvas.getByRole('button', { name: /continuar con email/i }))

    await expect(await canvas.findByRole('heading', { name: /revisá tu email/i })).toBeInTheDocument()
    await expect(canvas.getByText('tomas.ibanez@example.com')).toBeInTheDocument()
  },
}

/** Error de validación del servidor (ej. rate limit). */
export const Error: Story = {
  args: {
    action: fn(async () => ({
      status: 'error' as const,
      message: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Nombre'), 'Tomás')
    await userEvent.type(canvas.getByLabelText('Email'), 'tomas.ibanez@example.com')
    await userEvent.click(canvas.getByRole('checkbox'))
    await userEvent.click(canvas.getByRole('button', { name: /continuar con email/i }))

    await expect(await canvas.findByRole('alert')).toHaveTextContent(/demasiados intentos/i)
  },
}
