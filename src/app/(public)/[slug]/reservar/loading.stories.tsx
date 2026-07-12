import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import CheckoutLoading from './loading'

const meta = {
  title: 'Player/Checkout/CheckoutLoading',
  component: CheckoutLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CheckoutLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo del checkout, ya envuelto en ReservaDarkShell (misma silueta que la página real). */
export const Default: Story = {}
