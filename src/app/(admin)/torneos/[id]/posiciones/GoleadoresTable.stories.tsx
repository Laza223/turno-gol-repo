import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { scorerRows } from '@/test/fixtures'
import { GoleadoresTable } from './GoleadoresTable'

const meta = {
  title: 'Admin/Torneos/GoleadoresTable',
  component: GoleadoresTable,
  parameters: { layout: 'padded' },
  args: { scorers: { rows: scorerRows(), unattributedGoals: 0 } },
} satisfies Meta<typeof GoleadoresTable>

export default meta
type Story = StoryObj<typeof meta>

export const ConGoleadores: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Diego Fernández')).toBeVisible()
    await expect(canvas.getByText('#10')).toBeVisible()
    await expect(canvas.queryByText(/sin autor/i)).toBeNull()
  },
}

/**
 * El marcador y el acta pueden diferir por diseño: el complejo carga el 3-1 y
 * después, si quiere, quién los hizo. Se avisa, no se bloquea.
 */
export const ConGolesSinAutor: Story = {
  args: { scorers: { rows: scorerRows(), unattributedGoals: 4 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Faltan 4 gol\(es\) sin autor/)).toBeVisible()
  },
}

export const Vacio: Story = {
  args: { scorers: { rows: [], unattributedGoals: 0 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no hay goleadores')).toBeVisible()
  },
}
