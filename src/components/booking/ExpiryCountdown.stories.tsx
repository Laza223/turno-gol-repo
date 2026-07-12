import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { minutesFromNow } from '@/test/fixtures/clock'
import ExpiryCountdown from './ExpiryCountdown'

/**
 * `Date.now()` está congelado en FROZEN_NOW en el preview (ver .storybook/preview.tsx):
 * el `setInterval` de 1s sigue siendo real, pero cada tick vuelve a leer el
 * mismo instante congelado, así que el contador nunca avanza — es justamente
 * lo que permite que esta story sea determinista sin fake timers.
 */
const meta = {
  title: 'Player/BookingSuccess/ExpiryCountdown',
  component: ExpiryCountdown,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <p className="text-sm text-muted-foreground">
        Te queda{' '}
        <strong>
          <Story />
        </strong>{' '}
        para completar el pago.
      </p>
    ),
  ],
} satisfies Meta<typeof ExpiryCountdown>

export default meta
type Story = StoryObj<typeof meta>

/** El hold vence en 5 minutos (TTL típico de una reserva pendiente de pago). */
export const EnCurso: Story = {
  args: { expiresAt: minutesFromNow(5).toISOString() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('5:00')).toBeInTheDocument()
  },
}

/** `expiresAt` ya pasado: `formatRemaining` clampea el negativo a 0:00. */
export const Vencido: Story = {
  args: { expiresAt: minutesFromNow(-1).toISOString() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0:00')).toBeInTheDocument()
  },
}
