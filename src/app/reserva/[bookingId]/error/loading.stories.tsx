import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReservaErrorLoading from './loading'

const meta = {
  title: 'Player/BookingResult/ErrorLoading',
  component: ReservaErrorLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReservaErrorLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo (ícono + título + 2 líneas), ya envuelto en ReservaDarkShell. */
export const Default: Story = {}
