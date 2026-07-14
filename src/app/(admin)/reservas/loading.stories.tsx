import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReservasLoading from './loading'

const meta = {
  title: 'Admin/Reservas/Loading',
  component: ReservasLoading,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ReservasLoading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
