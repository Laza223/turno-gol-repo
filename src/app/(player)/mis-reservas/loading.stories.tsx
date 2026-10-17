import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PortalWorld } from '@/components/world/PortalWorld'
import MisReservasLoading from './loading'

const meta = {
  title: 'Player/MisReservas/Loading',
  component: MisReservasLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PortalWorld>
        <div className="min-h-dvh bg-background text-foreground">
          <Story />
        </div>
      </PortalWorld>
    ),
  ],
} satisfies Meta<typeof MisReservasLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Título, pestañas y tres tarjetas (la primera, la próxima, más alta), en la columna de la lista. */
export const Default: Story = {}
