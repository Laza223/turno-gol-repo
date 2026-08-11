import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { tenantListEmpty, tenantListRows } from '@/test/fixtures/super-admin'
import { TenantsTable } from './tenants-table'

/**
 * Tabla de tenants + paginación (Link, sin client state). `rows` es un
 * fixture estructuralmente compatible con `TenantList['rows']` real — ver el
 * comentario en resumen-tab.stories.tsx sobre por qué no se importa el tipo
 * directamente (`tenants.service.ts` es server-only).
 */
const meta = {
  title: 'SuperAdmin/Tenants/TenantsTable',
  component: TenantsTable,
  parameters: { layout: 'padded' },
  args: {
    rows: tenantListRows(),
    page: 1,
    totalPages: 1,
    prevHref: null,
    nextHref: null,
  },
} satisfies Meta<typeof TenantsTable>

export default meta
type Story = StoryObj<typeof meta>

/** Activo, trial, moroso y cancelado uno al lado del otro — cubre badge + MRR "—" vs con monto. */
export const Default: Story = {}

export const SinResultados: Story = {
  args: { rows: tenantListEmpty().rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('No hay tenants que coincidan con los filtros.'),
    ).toBeInTheDocument()
  },
}

/** Página intermedia: ambos links de paginación activos. */
export const PaginaIntermedia: Story = {
  args: {
    page: 2,
    totalPages: 3,
    prevHref: '/super-admin/tenants?page=1',
    nextHref: '/super-admin/tenants?page=3',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/super-admin/tenants?page=1',
    )
    await expect(canvas.getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/super-admin/tenants?page=3',
    )
  },
}

/** Última página: "Siguiente" queda como texto deshabilitado, no un link. */
export const UltimaPagina: Story = {
  args: { page: 3, totalPages: 3, prevHref: '/super-admin/tenants?page=2', nextHref: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Siguiente' })).not.toBeInTheDocument()
    await expect(canvas.getByText('Siguiente')).not.toHaveAttribute('href')
  },
}
