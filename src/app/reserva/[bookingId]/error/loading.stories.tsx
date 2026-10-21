import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import ReservaErrorLoading from './loading'

const meta = {
  title: 'Player/BookingResult/ErrorLoading',
  component: ReservaErrorLoading,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReservaErrorLoading>

export default meta
type Story = StoryObj<typeof meta>

/** Skeleton fijo (ícono + título + 2 líneas), en la misma columna y altura que el resultado. */
export const Default: Story = {}
