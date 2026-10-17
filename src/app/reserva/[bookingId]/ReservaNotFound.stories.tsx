import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PortalWorld } from '@/components/world/PortalWorld'
import { ReservaNotFound } from './ReservaNotFound'

const meta = {
  title: 'Player/BookingResult/ReservaNotFound',
  component: ReservaNotFound,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof ReservaNotFound>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Reserva inexistente, purgada o de otro jugador (RLS): estado neutro en gris, que no afirma que el
 * pago falló. Lo comparten las tres pantallas de vuelta.
 */
export const SinReserva: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No encontramos tu reserva')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Ver mis reservas' })).toHaveAttribute(
      'href',
      '/mis-reservas',
    )
  },
}
