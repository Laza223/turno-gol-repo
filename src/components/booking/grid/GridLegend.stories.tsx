import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { GridLegend } from './GridLegend'

/**
 * Leyenda estática de la grilla: mapea ícono↔estado (pages/grilla.md §11). Sin
 * props ni hooks — los 8 ítems (`GRID_LEGEND`) están acoplados 1:1 con
 * `slotVisual()` de BookingCard, así que esta es la única story posible: no hay
 * variantes de estado.
 */
const meta = {
  title: 'Booking/Grid/GridLegend',
  component: GridLegend,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GridLegend>

export default meta
type Story = StoryObj<typeof meta>

/**
 * "Por cobrar" (ámbar) reemplazó a "Sin cobrar" (rojo) el 2026-09-24, y el
 * 2026-09-25 el dueño volvió el rojo y renombró a "No cobrado": la leyenda se
 * deriva de la misma tabla que la celda, así que si alguien le devuelve el
 * nombre o el color viejo a una, rompe acá.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No cobrado')).toBeInTheDocument()
    await expect(canvas.queryByText('Por cobrar')).toBeNull()
  },
}
