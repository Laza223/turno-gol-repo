import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { salesRanking, salesRankingRow } from '@/test/fixtures'
import { uid } from '@/test/fixtures/ids'
import { TopSellers } from './TopSellers'

/** Doce productos: los 8 primeros a la vista y 4 detrás de "Ver los otros 4". */
const RANKING_LARGO = Array.from({ length: 12 }, (_, i) =>
  salesRankingRow({
    productId: uid(900 + i),
    productName: `Producto ${String(i + 1).padStart(2, '0')}`,
    units: 24 - i * 2,
    revenue: (24 - i * 2) * 300000,
  }),
)

const meta = {
  title: 'Admin/Caja/Productos/TopSellers',
  component: TopSellers,
  parameters: { layout: 'padded' },
  args: { range: 7, ranking: salesRanking() },
} satisfies Meta<typeof TopSellers>

export default meta
type Story = StoryObj<typeof meta>

/** De más a menos plata, con el total arriba y el período marcado. */
export const UltimaSemana: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByRole('region', { name: 'Lo que más salió en los últimos 7 días' })
    await expect(card).toHaveTextContent('$ 62.800 en 34 unidades')
    const rows = within(card).getAllByRole('listitem')
    await expect(rows[0]).toHaveTextContent('Agua mineral 500ml')
    await expect(rows[2]).toHaveTextContent('Alfajor Havanna')
    await expect(canvas.getByRole('link', { name: '7 días' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(canvas.getByRole('link', { name: '30 días' })).toHaveAttribute(
      'href',
      '/caja/productos?range=30',
    )
  },
}

/** Más de ocho: el resto queda a un clic, sin empujar la página. */
export const MasDeOcho: Story = {
  args: { ranking: RANKING_LARGO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Producto 08')).toBeVisible()
    await expect(canvas.getByText('Producto 09')).not.toBeVisible()

    await userEvent.click(canvas.getByText('Ver los otros 4'))
    await expect(canvas.getByText('Producto 12')).toBeVisible()
    await expect(canvas.getByText('Ver menos')).toBeVisible()
  },
}

export const TreintaDias: Story = {
  args: { range: 30 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: '30 días' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(canvas.getByRole('link', { name: '7 días' })).toHaveAttribute(
      'href',
      '/caja/productos',
    )
  },
}

export const SinVentas: Story = {
  args: { ranking: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No se vendió nada en los últimos 7 días.')).toBeVisible()
  },
}
