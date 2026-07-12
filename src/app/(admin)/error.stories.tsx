import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import AdminError from './error'

/**
 * Error boundary de TODO el panel admin (root de (admin), fuera de cualquier
 * sub-ruta con su propio error.tsx). Única variante del paquete con un link
 * secundario ("Ir al dashboard") — ErrorState lo dibuja si secondaryHref
 * está seteado.
 */
const meta = {
  title: 'Admin/Layout/AdminError',
  component: AdminError,
  parameters: { layout: 'fullscreen' },
  args: {
    error: Object.assign(new Error('Unexpected token in JSON at position 0'), {
      digest: '9174023658',
    }),
    reset: fn(),
  },
} satisfies Meta<typeof AdminError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /ir al dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  },
}
