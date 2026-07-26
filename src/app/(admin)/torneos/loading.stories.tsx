import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Loading from './loading'

const meta = {
  title: 'Admin/Torneos/Loading',
  component: Loading,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
