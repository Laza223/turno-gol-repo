import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { FirstBookingHint } from './FirstBookingHint'

/**
 * Hint de primera vez de la grilla (MASTER §7.2): vive directo dentro del
 * `<div className="space-y-4 ...">` de BookingGrid, sin envoltura propia —
 * reproducirlo suelto sobre el fondo `bg-background` es fiel al real.
 */
const meta = {
  title: 'Booking/Grid/FirstBookingHint',
  component: FirstBookingHint,
  parameters: { layout: 'padded' },
  args: { onDismiss: fn() },
} satisfies Meta<typeof FirstBookingHint>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Descartado: Story = {
  name: 'Click en "Entendido" dispara onDismiss',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Entendido' }))
    await expect(args.onDismiss).toHaveBeenCalledOnce()
  },
}
