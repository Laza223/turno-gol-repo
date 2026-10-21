import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import FavoritesList, { type FavoriteRow } from './FavoritesList'

const fav = (n: number, name = `Complejo ${n}`, city = 'Rosario'): FavoriteRow => ({
  id: `tenant-${n}`,
  slug: `complejo-${n}`,
  name,
  city,
})

const THREE = [
  fav(1, 'Complejo Fénix', 'Rosario'),
  fav(2, 'Canchas del Sur', 'Funes'),
  fav(3, 'El Potrero', 'Villa Gobernador Gálvez'),
]

/** Los complejos guardados: filas compactas sin precios ni fotos, en la columna de la página. */
const meta = {
  title: 'Player/Configuracion/FavoritesList',
  component: FavoritesList,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-[35rem] bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FavoritesList>

export default meta
type Story = StoryObj<typeof meta>

export const SinFavoritos: Story = {
  args: { favorites: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { level: 2, name: 'Favoritos' })).toBeInTheDocument()
    await expect(canvas.getByText(/todavía no guardaste ningún complejo/i)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Explorar complejos' })).toHaveAttribute(
      'href',
      '/explorar',
    )
  },
}

export const ConFavoritos: Story = {
  args: { favorites: THREE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3)
    // Cada fila lleva a la página del complejo, con su localidad; no hay precios.
    const link = canvas.getByRole('link', { name: /Complejo Fénix/ })
    await expect(link).toHaveAttribute('href', '/complejo-1')
    await expect(link).toHaveTextContent('Rosario')
    await expect(canvas.queryByText(/\$/)).not.toBeInTheDocument()
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  },
}

export const NombreLargo: Story = {
  args: {
    favorites: [
      fav(
        1,
        'Complejo Deportivo Club Atlético Sociedad de Fomento y Biblioteca Popular Barrio Parque Norte',
        'San Martín de los Andes',
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const fila = canvas.getByRole('listitem')
    await expect(fila.scrollWidth).toBeLessThanOrEqual(fila.clientWidth)
    await expect(canvas.getByRole('button', { name: /^Quitar/ })).toBeVisible()
  },
}

/** El tope del search público: 50 filas, una lista sola (no 50 tarjetas con foto). */
export const Cincuenta: Story = {
  args: { favorites: Array.from({ length: 50 }, (_, i) => fav(i + 1)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(50)
  },
}

/** Quitar uno saca la fila al instante y lo anuncia; el foco vuelve al título de la sección. */
export const QuitarSacaLaFila: Story = {
  args: { favorites: THREE },
  parameters: {
    fetchMock: [
      {
        match: '/api/player/favorites/toggle',
        json: { data: { tenantId: 'tenant-2', favorited: false } },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Quitar Canchas del Sur de favoritos' }),
    )
    await waitFor(() => expect(canvas.queryByText('Canchas del Sur')).not.toBeInTheDocument())
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Quitaste Canchas del Sur de tus favoritos.',
    )
    await expect(canvas.getByRole('heading', { level: 2, name: 'Favoritos' })).toHaveFocus()
  },
}

/** Si quita el último, queda la salida a Explorar. */
export const QuitarElUltimo: Story = {
  args: { favorites: [fav(1)] },
  parameters: {
    fetchMock: [{ match: '/api/player/favorites/toggle', json: { data: { favorited: false } } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Quitar/ }))
    await expect(await canvas.findByRole('link', { name: 'Explorar complejos' })).toBeVisible()
  },
}

/** Si no se pudo quitar, la fila se queda y el error dice qué pasó. */
export const ErrorAlQuitar: Story = {
  args: { favorites: THREE },
  parameters: {
    fetchMock: [
      { match: '/api/player/favorites/toggle', json: { error: 'server_error' }, status: 500 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Quitar Complejo Fénix de favoritos' }),
    )
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/No pudimos quitarlo/)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3)
  },
}
