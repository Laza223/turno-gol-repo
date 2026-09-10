import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CourtStatusBadge } from './status-visual'

const meta = {
  title: 'Admin/Canchas/CourtStatusBadge',
  component: CourtStatusBadge,
  parameters: { layout: 'centered' },
  args: { status: 'online' },
} satisfies Meta<typeof CourtStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Online: Story = { args: { status: 'online' } }
export const Offline: Story = { args: { status: 'offline' } }
