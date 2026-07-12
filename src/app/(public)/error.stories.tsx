import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import PublicError from './error'

function errorWithDigest(digest?: string): Error & { digest?: string } {
  const err = new Error('fetch failed') as Error & { digest?: string }
  if (digest) err.digest = digest
  return err
}

const meta = {
  title: 'Public/ErrorBoundary',
  component: PublicError,
  parameters: { layout: 'fullscreen' },
  args: { reset: fn() },
} satisfies Meta<typeof PublicError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { error: errorWithDigest() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument()
    await expect(canvas.queryByText(/código de referencia/i)).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Reintentar' }))
    await expect(args.reset).toHaveBeenCalledTimes(1)
  },
}

/** Con `digest`: el código de referencia queda visible para pegarlo en un ticket de soporte. */
export const ConDigest: Story = {
  args: { error: errorWithDigest('a1b2c3d4') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('a1b2c3d4')).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /explorar complejos/i })).toHaveAttribute('href', '/explorar')
  },
}
