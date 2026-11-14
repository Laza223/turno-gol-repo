import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import ExplorarLoading from './loading'

const meta = {
  title: 'Player/Explorar/ExplorarLoading',
  component: ExplorarLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExplorarLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Esqueletos de vidrio con la forma de la barra, el encabezado y 8 tarjetas. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('status', { name: 'Cargando complejos…' }),
    ).toBeInTheDocument()
  },
}
