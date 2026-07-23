import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { canteenDailyTotalsLargo, canteenDailyTotals, canteenMethodTotals, salesRanking } from '@/test/fixtures'
import { CanteenReport } from './CanteenReport'

const meta = {
  title: 'Admin/Caja/Productos/CanteenReport',
  component: CanteenReport,
  parameters: { layout: 'padded' },
  args: {
    range: 7,
    ranking: salesRanking(),
    byMethod: canteenMethodTotals(),
    daily: canteenDailyTotals(),
  },
} satisfies Meta<typeof CanteenReport>

export default meta
type Story = StoryObj<typeof meta>

/** Rango 7 días típico: ranking, cobrado por método y por día, todos con datos. */
export const ConDatos: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ventas de cantina — últimos 7 días')).toBeVisible()

    // Ranking: los 3 productos, orden como viene (revenue DESC).
    await expect(canvas.getByText('Agua mineral 500ml')).toBeVisible()
    await expect(canvas.getByText('Gatorade 500ml')).toBeVisible()
    await expect(canvas.getByText('Alfajor Havanna')).toBeVisible()

    // Cobrado por método: labels en español de METHOD_LABELS.
    await expect(canvas.getByText('Efectivo')).toBeVisible()
    await expect(canvas.getByText('Transferencia')).toBeVisible()
    await expect(canvas.getByText('MercadoPago')).toBeVisible()

    // Nota al pie obligatoria (explica la asimetría ranking vs. cobrado).
    await expect(
      canvas.getByText(/El ranking cuenta lo entregado/),
    ).toBeVisible()

    // El chip de 7 días es el activo.
    await expect(canvas.getByRole('link', { name: '7 días' })).toHaveAttribute('aria-current', 'true')
    await expect(canvas.getByRole('link', { name: '30 días' })).not.toHaveAttribute('aria-current')
  },
}

/** Sin ventas en el período: los 3 bloques muestran su empty state, la card no desaparece. */
export const SinVentas: Story = {
  args: { ranking: [], byMethod: [], daily: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin ventas en el período.')).toBeVisible()
    await expect(canvas.getAllByText('Sin cobros en el período.').length).toBe(2)
  },
}

/** Rango 30 días con 14 filas de "Por día": fuerza el scroll vertical (max-h + overflow-y-auto). */
export const Rango30: Story = {
  args: { range: 30, daily: canteenDailyTotalsLargo() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ventas de cantina — últimos 30 días')).toBeVisible()
    await expect(canvas.getByRole('link', { name: '30 días' })).toHaveAttribute('aria-current', 'true')
    await expect(canvas.getByRole('link', { name: '7 días' })).not.toHaveAttribute('aria-current')
  },
}
