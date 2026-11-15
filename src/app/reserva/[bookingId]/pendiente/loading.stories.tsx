import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReservaPendienteLoading from './loading'

const meta = {
  title: 'Player/BookingResult/PendienteLoading',
  component: ReservaPendienteLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient min-h-dvh text-portal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReservaPendienteLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo (ícono + título + 2 líneas), en la misma columna y altura que el resultado. */
export const Default: Story = {}
