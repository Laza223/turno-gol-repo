import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PortalWorld } from '@/components/world/PortalWorld'
import ReservaExitoLoading from './loading'

const meta = {
  title: 'Player/BookingResult/ExitoLoading',
  component: ReservaExitoLoading,
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
} satisfies Meta<typeof ReservaExitoLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo (ícono + título + resumen + botón + lista), en la columna de la reserva confirmada. */
export const Default: Story = {}
