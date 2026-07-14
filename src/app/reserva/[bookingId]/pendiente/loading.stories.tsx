import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReservaPendienteLoading from './loading'

const meta = {
  title: 'Player/BookingResult/PendienteLoading',
  component: ReservaPendienteLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReservaPendienteLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo (ícono + título + 2 líneas), ya envuelto en ReservaDarkShell. */
export const Default: Story = {}
