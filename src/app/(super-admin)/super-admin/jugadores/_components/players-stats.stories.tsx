import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { playerStats } from './player-fixtures'
import { PlayersStats } from './players-stats'

const meta = {
  title: 'SuperAdmin/Jugadores/PlayersStats',
  component: PlayersStats,
  parameters: { layout: 'padded' },
  args: { stats: playerStats() },
} satisfies Meta<typeof PlayersStats>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nuevos hoy')).toBeInTheDocument()
    await expect(canvas.getByText('Iniciaron sesión')).toBeInTheDocument()
  },
}

export const SinJugadores: Story = {
  args: {
    stats: {
      total: 0,
      newToday: 0,
      new7d: 0,
      new30d: 0,
      active7d: 0,
      series: playerStats().series.map((d) => ({ ...d, newPlayers: 0 })),
    },
  },
}
