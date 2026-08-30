import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import SuspendedPage from './page'

const meta = {
  title: 'Public/SuspendedPage',
  component: SuspendedPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SuspendedPage>

export default meta
type Story = StoryObj<typeof meta>

/** Estado único: cuenta del complejo suspendida (staff intenta entrar al panel). */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Tu cuenta está temporalmente suspendida' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Contactar a soporte' })).toHaveAttribute(
      'href',
      'mailto:turnogol@gmail.com',
    )
  },
}
