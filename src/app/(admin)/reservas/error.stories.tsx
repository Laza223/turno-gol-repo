import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import ReservasError from './error'

const meta = {
  title: 'Admin/Reservas/Error',
  component: ReservasError,
  parameters: { layout: 'padded' },
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: undefined }),
    reset: fn(),
  },
} satisfies Meta<typeof ReservasError>

export default meta
type Story = StoryObj<typeof meta>

export const SinDigest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No pudimos cargar las reservas')).toBeVisible()
    await expect(canvas.queryByText(/código de referencia/i)).not.toBeInTheDocument()
  },
}

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: 'r3s3rv4' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('r3s3rv4')).toBeVisible()
  },
}
