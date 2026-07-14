import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReservaExitoLoading from './loading'

const meta = {
  title: 'Player/BookingResult/ExitoLoading',
  component: ReservaExitoLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReservaExitoLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo (badge + título + card de recibo), ya envuelto en ReservaDarkShell. */
export const Default: Story = {}
