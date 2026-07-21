import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { GhostKpis } from './GhostKpis'

/**
 * Estado vacío del reporte mensual de /analiticas (mes sin movimientos). La
 * página en sí es un server component async (auth + DB), no storybook-able:
 * esta story existe sobre todo para que el gate a11y cubra el patrón
 * fantasma — la versión original (`opacity-50` sobre el grid entero)
 * componía ~3.79:1 sobre el `text-foreground` de los StatCard, bajo AA, y
 * nunca la atrapó el runner porque page.tsx no tenía story propia.
 */
const meta = {
  title: 'Admin/Analiticas/GhostKpis',
  component: GhostKpis,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GhostKpis>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Así se verá tu mes cuando cargues reservas')).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'Cargá tu primera reserva desde la grilla' }),
    ).toBeVisible()
    // Ingresos y Saldo comparten el valor fantasma.
    await expect(canvas.getAllByText('$ 85.000,00')).toHaveLength(2)
  },
}
