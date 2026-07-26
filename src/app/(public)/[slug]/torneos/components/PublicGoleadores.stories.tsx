import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { scorerRows } from '@/test/fixtures'
import { PublicGoleadores } from './PublicGoleadores'

const meta = {
  title: 'Public/Torneos/PublicGoleadores',
  component: PublicGoleadores,
  parameters: { layout: 'padded' },
  args: { scorers: { rows: scorerRows(), unattributedGoals: 0 } },
} satisfies Meta<typeof PublicGoleadores>

export default meta
type Story = StoryObj<typeof meta>

export const ConGoleadores: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Diego Fernández')).toBeVisible()
    await expect(canvas.getByText('#10')).toBeVisible()
  },
}

/**
 * Los goles sin autor son un pendiente del complejo, no del que mira: acá NO
 * se avisan (en el panel sí).
 */
export const GolesSinAutorNoSeAvisan: Story = {
  args: { scorers: { rows: scorerRows(), unattributedGoals: 4 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/sin autor/i)).toBeNull()
    await expect(canvas.getByText('Diego Fernández')).toBeVisible()
  },
}

export const SinGoleadores: Story = {
  args: { scorers: { rows: [], unattributedGoals: 0 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('heading', { name: 'Goleadores' })).toBeNull()
  },
}
