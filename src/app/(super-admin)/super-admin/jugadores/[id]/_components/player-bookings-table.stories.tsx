import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { playerBookingRows } from '../../_components/player-fixtures'
import { PlayerBookingsTable } from './player-bookings-table'

const meta = {
  title: 'SuperAdmin/Jugadores/PlayerBookingsTable',
  component: PlayerBookingsTable,
  parameters: { layout: 'padded' },
  args: {
    rows: playerBookingRows(),
    page: 0,
    total: playerBookingRows().length,
    pageSize: 20,
    hrefFor: (p: number) => `/super-admin/jugadores/x?pagina=${p + 1}`,
  },
} satisfies Meta<typeof PlayerBookingsTable>

export default meta
type Story = StoryObj<typeof meta>

/** Online y cargada por el complejo; ausente, jugada y cancelada sin cancha. */
export const Default: Story = {}

export const SinReservas: Story = {
  args: { rows: [], total: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Todavía no hizo reservas.')).toBeInTheDocument()
  },
}

export const PaginaFueraDeRango: Story = {
  args: { rows: [], page: 98, total: 3 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Esa página no existe/)).toBeInTheDocument()
  },
}

export const PaginaIntermedia: Story = {
  args: { page: 1, total: 55 },
}
