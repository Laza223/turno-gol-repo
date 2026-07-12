import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import ActivityStats from './ActivityStats'

const meta = {
  title: 'Player/Perfil/ActivityStats',
  component: ActivityStats,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ActivityStats>

export default meta
type Story = StoryObj<typeof meta>

/** played=0: hint de "cuando completes tu primer partido..." y racha apagada. */
export const SinActividad: Story = {
  args: { played: 0, venues: 0, streakWeeks: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Cuando completes tu primer partido vas a ver tu actividad acá.'),
    ).toBeInTheDocument()
  },
}

/** streakWeeks=1: "semana" en singular. */
export const RachaSingular: Story = {
  args: { played: 12, venues: 3, streakWeeks: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('semana')).toBeInTheDocument()
  },
}

/** streakWeeks>1: "semanas" en plural + acento naranja activo. */
export const RachaPlural: Story = {
  args: { played: 34, venues: 5, streakWeeks: 6 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('semanas')).toBeInTheDocument()
  },
}
