import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { NOW_MS, playerListRows } from './player-fixtures'
import { PlayersTable } from './players-table'

const meta = {
  title: 'SuperAdmin/Jugadores/PlayersTable',
  component: PlayersTable,
  parameters: { layout: 'padded' },
  args: {
    rows: playerListRows(),
    page: 0,
    total: playerListRows().length,
    pageSize: 25,
    filtered: false,
    now: NOW_MS,
    hrefFor: (p: number) => `/super-admin/jugadores?pagina=${p + 1}`,
  },
} satisfies Meta<typeof PlayersTable>

export default meta
type Story = StoryObj<typeof meta>

/** Activo, sin ingreso, bloqueado y anonimizado (sin contacto) uno al lado del otro. */
export const Default: Story = {}

export const SinJugadores: Story = {
  args: { rows: [], total: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Todavía no hay jugadores')).toBeInTheDocument()
  },
}

export const SinCoincidencias: Story = {
  args: { rows: [], total: 0, filtered: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Ningún jugador coincide')).toBeInTheDocument()
  },
}

export const PaginaFueraDeRango: Story = {
  args: { rows: [], page: 98, total: 10 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Esa página no existe/)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Volver al principio' })).toHaveAttribute(
      'href',
      '/super-admin/jugadores?pagina=1',
    )
  },
}

export const PaginaIntermedia: Story = {
  args: { page: 1, total: 80 },
}
