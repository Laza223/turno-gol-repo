import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AbonadoStatusBadge } from './status-visual'

const meta = {
  title: 'Admin/Abonados/AbonadoStatusBadge',
  component: AbonadoStatusBadge,
  parameters: { layout: 'centered' },
  args: { status: 'active' },
} satisfies Meta<typeof AbonadoStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Active: Story = { args: { status: 'active' } }
export const Paused: Story = { args: { status: 'paused' } }
export const Canceled: Story = { args: { status: 'canceled' } }
