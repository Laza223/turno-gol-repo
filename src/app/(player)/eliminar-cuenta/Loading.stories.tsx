import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Loading from './loading'

/** Esqueleto de /eliminar-cuenta, en la columna de la página. */
const meta = {
  title: 'Player/EliminarCuenta/LoadingSkeleton',
  component: Loading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
