import type { Meta, StoryObj } from '@storybook/nextjs-vite'
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

export const Default: Story = {}
