import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PlusBadge } from './plus-badge'

const meta = {
  title: 'UI/PlusBadge',
  component: PlusBadge,
} satisfies Meta<typeof PlusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Plus')).toBeInTheDocument()
  },
}
