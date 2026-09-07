import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { SuspendedView } from './SuspendedView'

// La story monta la vista y no `page.tsx`: desde AUD-01 la página resuelve la
// sesión, y eso arrastra `node:async_hooks`, que en el navegador de Storybook
// no existe.
const meta = {
  title: 'Public/SuspendedPage',
  component: SuspendedView,
  parameters: { layout: 'fullscreen' },
  args: { mostrarCambioDeComplejo: false },
} satisfies Meta<typeof SuspendedView>

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
