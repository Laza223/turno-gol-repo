import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Check } from 'lucide-react'
import ReservaDarkShell from './ReservaDarkShell'

/**
 * Cascarón compartido por confirmar, éxito, pendiente y error de reserva (y sus loading.tsx), en
 * el portal de vidrio (F5): la luz de fondo del portal (`.portal-ambient`) y la columna de 480 px
 * (`.rv-col`). Se muestra con contenido real (la insignia y el título de la reserva confirmada)
 * para que la luz se vea con algo encima.
 */
const meta = {
  title: 'Player/BookingSuccess/ReservaDarkShell',
  component: ReservaDarkShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="text-portal-ink">
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <div className="rv-done pt-10">
        <span className="rv-badge">
          <Check aria-hidden />
        </span>
        <h1 className="rv-h1">¡Reserva confirmada!</h1>
      </div>
    ),
  },
} satisfies Meta<typeof ReservaDarkShell>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
