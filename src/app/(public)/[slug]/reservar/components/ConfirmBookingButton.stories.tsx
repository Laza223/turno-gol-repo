import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import ConfirmBookingButton from './ConfirmBookingButton'

/**
 * `action` entra por prop (ver el comentario en el componente). `../actions` es
 * `'use server'` y arrastra `request-context` → `node:async_hooks`, que Vite
 * externaliza en el browser y rompe la story si se importa como valor.
 */
const meta = {
  title: 'Player/Checkout/ConfirmBookingButton',
  component: ConfirmBookingButton,
  parameters: { layout: 'padded' },
  args: {
    slug: 'complejo-fenix',
    court: '00000000-0000-4000-8000-000000000101',
    date: '2026-03-14',
    time: '18:00',
    dur: 60,
    payMethods: ['mercadopago'],
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
} satisfies Meta<typeof ConfirmBookingButton>

export default meta
type Story = StoryObj<typeof meta>

/** Con seña: el CTA pide pagarla vía MercadoPago antes de confirmar. */
export const ConSena: Story = {
  args: { depositAmount: 450000, payMethods: ['mercadopago'], action: fn(async () => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /pagar seña y reservar/i })).toBeInTheDocument()
    await expect(canvas.getByText(/te llevamos a mercadopago/i)).toBeInTheDocument()
  },
}

/** Sin seña: el complejo acepta efectivo/transferencia, la reserva queda confirmada al instante. */
export const SinSena: Story = {
  args: { depositAmount: 0, payMethods: ['cash', 'transfer'], action: fn(async () => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /^confirmar reserva$/i })).toBeInTheDocument()
    await expect(canvas.getByText(/queda confirmado al instante/i)).toBeInTheDocument()
  },
}

/** Submit dispara la Server Action inyectada; mientras está pendiente el botón muestra spinner. */
export const Enviando: Story = {
  args: {
    depositAmount: 450000,
    payMethods: ['mercadopago'],
    action: fn(() => new Promise<void>(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: /pagar seña y reservar/i })
    await userEvent.click(button)
    await expect(await canvas.findByRole('button', { name: /procesando/i })).toBeDisabled()
  },
}
