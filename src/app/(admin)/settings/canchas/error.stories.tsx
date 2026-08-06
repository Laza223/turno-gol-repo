import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import CanchasError from './error'

const meta = {
  title: 'Admin/Canchas/Error',
  component: CanchasError,
  parameters: { layout: 'padded' },
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: undefined }),
    reset: fn(),
  },
} satisfies Meta<typeof CanchasError>

export default meta
type Story = StoryObj<typeof meta>

export const SinDigest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No pudimos cargar las canchas')).toBeVisible()
  },
}

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: 'c9d0e1f2' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('c9d0e1f2')).toBeVisible()
  },
}
