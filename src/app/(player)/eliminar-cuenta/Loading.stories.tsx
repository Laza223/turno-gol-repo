import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PortalWorld } from '@/components/world/PortalWorld'
import Loading from './loading'

/** Esqueleto de /eliminar-cuenta, en la columna y el mundo de La Reserva. */
const meta = {
  title: 'Player/EliminarCuenta/LoadingSkeleton',
  component: Loading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof Loading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
