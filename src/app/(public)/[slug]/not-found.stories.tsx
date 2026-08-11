import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import TenantNotFound from './not-found'

const meta = {
  title: 'Player/TenantProfile/NotFound',
  component: TenantNotFound,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TenantNotFound>

export default meta
type Story = StoryObj<typeof meta>

/** Estado único: el slug no corresponde a ningún complejo. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Complejo no encontrado' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute(
      'href',
      '/',
    )
  },
}
