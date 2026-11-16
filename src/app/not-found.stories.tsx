import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { NotFoundView } from '@/components/world/NotFoundView'

// La story monta la vista y no `not-found.tsx`: la página arrastra `signOutAction` (node:crypto),
// que en el navegador de Storybook no existe.
const meta = {
  title: 'Layout/NotFoundPage',
  component: NotFoundView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="portal-ambient text-portal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotFoundView>

export default meta
type Story = StoryObj<typeof meta>

/** 404 estático — sin props, sin lógica. Un solo estado real. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      '/',
    )
  },
}
