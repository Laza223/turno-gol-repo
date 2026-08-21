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
  args: {
    next: '/complejo-fenix/reservar?court=101&date=2026-03-14&time=18:00&dur=60',
    googleAction: fn(async () => {}),
  },
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

    await expect(
      await canvas.findByRole('heading', { name: /revisá tu email/i }),
    ).toBeInTheDocument()
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

/**
 * El MISMO error, pero sobre un fondo que axe pueda resolver.
 *
 * `.reserva-receipt-card` se pinta en light con
 * `linear-gradient(180deg, #ffffff, #f0fdf4)`, y axe no dictamina contraste
 * sobre un gradiente: devuelve `incomplete`, que NO falla el runner. O sea que
 * la story `Error` de arriba entra al estado pero deja el color sin medir —
 * exactamente el agujero que en la grilla dejó pasar un `text-destructive` por
 * debajo de AA.
 *
 * Acá se fija la tarjeta en `#f0fdf4`, que es el extremo INFERIOR del mismo
 * gradiente (el peor caso real: el aviso vive en la mitad de abajo del form).
 * No es un fondo inventado — es un punto de la superficie que ya existe, y con
 * él axe sí emite veredicto.
 */
export const ErrorSobreFondoMedible: Story = {
  args: Error.args,
  decorators: [
    (Story) => (
      <>
        <style>{'.reserva-receipt-card { background: #f0fdf4; }'}</style>
        <Story />
      </>
    ),
  ],
  play: Error.play,
}
