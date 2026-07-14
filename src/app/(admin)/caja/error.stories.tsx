import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import CajaError from './error'

const meta = {
  title: 'Admin/Caja/Error',
  component: CajaError,
  parameters: { layout: 'padded' },
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: undefined }),
    reset: fn(),
  },
} satisfies Meta<typeof CajaError>

export default meta
type Story = StoryObj<typeof meta>

export const SinDigest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No pudimos cargar la caja')).toBeVisible()
  },
}

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: 'e5f6a7b8' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('e5f6a7b8')).toBeVisible()
  },
}
