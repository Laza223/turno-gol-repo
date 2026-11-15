import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import MisReservasLoading from './loading'

const meta = {
  title: 'Player/MisReservas/Loading',
  component: MisReservasLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div data-portal-glass className="min-h-dvh text-portal-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MisReservasLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Cabecera, control de pestañas y tres tarjetas de vidrio (la primera, la próxima, más alta), en la columna de la lista. */
export const Default: Story = {}
