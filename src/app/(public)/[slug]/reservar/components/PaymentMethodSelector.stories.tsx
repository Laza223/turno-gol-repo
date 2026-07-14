import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import ReservaDarkShell from '@/components/booking/ReservaDarkShell'
import PaymentMethodSelector from './PaymentMethodSelector'

const meta = {
  title: 'Player/Checkout/PaymentMethodSelector',
  component: PaymentMethodSelector,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReservaDarkShell>
        <div className="mx-auto max-w-md px-4 py-6">
          <Story />
        </div>
      </ReservaDarkShell>
    ),
  ],
} satisfies Meta<typeof PaymentMethodSelector>

export default meta
type Story = StoryObj<typeof meta>

/** Con seña: único método posible es MercadoPago (regla de negocio), con aclaración. */
export const SoloDeposito: Story = {
  args: { methods: ['mercadopago'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: /mercadopago/i })).toBeChecked()
    await expect(canvas.getByText(/este complejo pide seña online/i)).toBeInTheDocument()
  },
}

/** Sin seña: el complejo acepta efectivo y transferencia lado a lado. */
export const EfectivoYTransferencia: Story = {
  args: { methods: ['cash', 'transfer'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: /efectivo/i })).toBeChecked()
    await expect(canvas.getByRole('radio', { name: /transferencia/i })).not.toBeChecked()

    await userEvent.click(canvas.getByText('Transferencia'))
    await expect(canvas.getByRole('radio', { name: /transferencia/i })).toBeChecked()
  },
}

/** Sin métodos configurados (complejo sin seña y sin efectivo/transferencia activados): no renderiza nada. */
export const SinMetodos: Story = {
  args: { methods: [] },
}
