import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { planSummaries } from '@/test/fixtures/super-admin'
import { TenantsFilters } from './tenants-filters'

/**
 * Filtros GET de la lista de tenants — form `method="get"` sin JS, submitea
 * por navegación normal (sin client state que storear).
 */
const meta = {
  title: 'SuperAdmin/Tenants/TenantsFilters',
  component: TenantsFilters,
  parameters: { layout: 'padded' },
  args: { plans: planSummaries() },
} satisfies Meta<typeof TenantsFilters>

export default meta
type Story = StoryObj<typeof meta>

/** Sin filtros activos: no aparece el link "Limpiar". */
export const SinFiltros: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Limpiar' })).not.toBeInTheDocument()
  },
}

/** Con búsqueda + estado + plan activos: aparece "Limpiar" y cada control preselecciona su valor. */
export const ConFiltrosActivos: Story = {
  args: { q: 'fénix', status: 'past_due', planSlug: 'complejo' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Buscar')).toHaveValue('fénix')
    await expect(canvas.getByLabelText('Estado')).toHaveValue('past_due')
    await expect(canvas.getByLabelText('Plan')).toHaveValue('complejo')
    await expect(canvas.getByRole('link', { name: 'Limpiar' })).toHaveAttribute(
      'href',
      '/super-admin/tenants',
    )
  },
}
