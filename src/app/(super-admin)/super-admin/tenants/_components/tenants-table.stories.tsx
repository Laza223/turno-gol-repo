import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { tenantListEmpty, tenantListRows } from '@/test/fixtures/super-admin'
import { TenantsTable } from './tenants-table'

/**
 * Tabla de tenants + paginación (Pager compartido, Link, sin client state).
 * `rows` es un fixture estructuralmente compatible con `TenantList['rows']`
 * real — ver el comentario en resumen-tab.stories.tsx sobre por qué no se
 * importa el tipo directamente (`tenants.service.ts` es server-only).
 */
const meta = {
  title: 'SuperAdmin/Tenants/TenantsTable',
  component: TenantsTable,
  parameters: { layout: 'padded' },
  args: {
    rows: tenantListRows(),
    page: 0,
    total: tenantListRows().length,
    pageSize: 20,
    hrefFor: (p: number) => `/super-admin/tenants?page=${p + 1}`,
  },
} satisfies Meta<typeof TenantsTable>

export default meta
type Story = StoryObj<typeof meta>

/** Activo, trial, moroso y cancelado uno al lado del otro — cubre badge + MRR "—" vs con monto. */
export const Default: Story = {}

export const SinResultados: Story = {
  args: { rows: tenantListEmpty().rows, total: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('No hay tenants que coincidan con los filtros.'),
    ).toBeInTheDocument()
  },
}

/**
 * `?page=99` de un link viejo con 5 complejos: no dice "no hay tenants" (sí
 * hay), dice que la página no existe, y no dibuja un paginador cuyo
 * "Anteriores" llevaría a la 98.
 */
export const PaginaFueraDeRango: Story = {
  args: { rows: tenantListEmpty().rows, page: 98, total: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Esa página no existe/)).toBeInTheDocument()
    await expect(canvas.getByRole('link', { name: 'Volver al principio' })).toHaveAttribute(
      'href',
      '/super-admin/tenants?page=1',
    )
    await expect(canvas.queryByRole('navigation')).toBeNull()
    await expect(canvas.queryByText('No hay tenants que coincidan con los filtros.')).toBeNull()
  },
}

/** Página intermedia: "Anteriores" y "Siguientes" activos, ambos links de verdad. */
export const PaginaIntermedia: Story = {
  args: { page: 1, total: 60, pageSize: 20 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Anteriores' })).toHaveAttribute(
      'href',
      '/super-admin/tenants?page=1',
    )
    await expect(canvas.getByRole('link', { name: 'Siguientes' })).toHaveAttribute(
      'href',
      '/super-admin/tenants?page=3',
    )
  },
}

/** Última página: "Siguientes" queda como texto deshabilitado, no un link. */
export const UltimaPagina: Story = {
  args: { page: 2, total: 60, pageSize: 20 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Siguientes' })).not.toBeInTheDocument()
    await expect(canvas.getByText('Siguientes')).not.toHaveAttribute('href')
  },
}
