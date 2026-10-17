import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PlayersFilters } from './players-filters'

const meta = {
  title: 'SuperAdmin/Jugadores/PlayersFilters',
  component: PlayersFilters,
  parameters: { layout: 'padded' },
  args: { filter: 'todos' },
} satisfies Meta<typeof PlayersFilters>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Limpiar' })).toBeNull()
    await expect(canvas.getByRole('link', { name: 'Todos' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  },
}

/** Búsqueda + filtro activos: aparece "Limpiar" y el chip conserva la búsqueda. */
export const ConBusquedaYFiltro: Story = {
  args: { q: 'fernández', filter: 'con-reservas' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Limpiar' })).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Bloqueados' })).toHaveAttribute(
      'href',
      '/super-admin/jugadores?q=fern%C3%A1ndez&filtro=bloqueados',
    )
  },
}
