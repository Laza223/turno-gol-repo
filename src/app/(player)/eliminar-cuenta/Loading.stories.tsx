import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import Loading from './loading'

/** Skeleton único de /eliminar-cuenta. Reproduce el fondo `.player-shell-bg` del portal. */
const meta = {
  title: 'Player/EliminarCuenta/LoadingSkeleton',
  component: Loading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="player-shell-bg min-h-dvh py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
