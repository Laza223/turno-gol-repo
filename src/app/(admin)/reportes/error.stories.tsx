import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import ReportesError from './error'

/**
 * Variante `variant="inline"` con `h1` propio (distinto del patrón `contained`
 * de otras secciones) y `description={error.message}` directo — no un texto
 * fijo, así que la story ejercita el mensaje real del Error.
 */
const meta = {
  title: 'Admin/Reportes/Error',
  component: ReportesError,
  parameters: { layout: 'padded' },
  args: {
    error: Object.assign(new Error('No se pudo calcular el reporte de ingresos.'), { digest: undefined }),
    reset: fn(),
  },
} satisfies Meta<typeof ReportesError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: 'Reportes' })).toBeVisible()
    // Título + description comparten un mismo <p> (2 nodos de texto
    // adyacentes): un match exacto de string solo pega contra TODO el texto
    // del elemento, por eso el matcher es una regex (substring).
    await expect(canvas.getByText(/No se pudo calcular el reporte de ingresos\./)).toBeVisible()
  },
}

export const OtroMensaje: Story = {
  args: {
    error: Object.assign(new Error('Timeout consultando cash_flows.'), { digest: undefined }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Timeout consultando cash_flows\./)).toBeVisible()
  },
}
