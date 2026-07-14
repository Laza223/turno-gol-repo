import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import AbonadosError from './error'

const meta = {
  title: 'Admin/Abonados/Error',
  component: AbonadosError,
  parameters: { layout: 'padded' },
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: undefined }),
    reset: fn(),
  },
} satisfies Meta<typeof AbonadosError>

export default meta
type Story = StoryObj<typeof meta>

export const SinDigest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No pudimos cargar los abonados')).toBeVisible()
    await expect(canvas.queryByText(/código de referencia/i)).not.toBeInTheDocument()
  },
}

export const ConDigest: Story = {
  args: {
    error: Object.assign(new Error('DB connection timeout'), { digest: 'a1b2c3d4' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('a1b2c3d4')).toBeVisible()
  },
}
