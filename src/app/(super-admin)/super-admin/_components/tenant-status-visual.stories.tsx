import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { SA_TENANT_STATUSES } from '@/test/fixtures/super-admin'
import { TenantStatusBadge } from './tenant-status-visual'

/**
 * Badge de estado del tenant, único en todo el panel de super-admin: dashboard
 * ("Tenants por estado" y signups recientes), lista de tenants y detalle.
 *
 * B1 fusionó los dos casi-gemelos que había (`_components/tenant-status-badge.tsx`
 * y `tenants/_components/status-badge.tsx`). Tenían el mismo set de 8 estados y
 * las mismas etiquetas, pero colores divergentes — `suspended` ámbar en uno y
 * rojo en el otro — y ninguno pasaba por `StatusBadge`, así que distinguían los
 * 8 estados **solo por color**, contra MASTER §1.4.
 */
const meta = {
  title: 'SuperAdmin/TenantStatusBadge',
  component: TenantStatusBadge,
  parameters: { layout: 'centered' },
  args: { status: 'active' },
} satisfies Meta<typeof TenantStatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Los 8 estados de `tenant_status`, uno al lado del otro. */
export const TodosLosEstados: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {SA_TENANT_STATUSES.map((status) => (
        <TenantStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // El candado de la regla que los badges viejos rompían: cada estado tiene
    // que ser distinguible SIN mirar el color. Si alguien vuelve a pintar dos
    // estados del mismo tono, las etiquetas los siguen separando.
    for (const label of ['Trial', 'Activo', 'Pago vencido', 'Suspendido', 'Bloqueado', 'Cancelado', 'Churned', 'Eliminado']) {
      await expect(canvas.getByText(label)).toBeVisible()
    }
  },
}

/** Con contador — como en "Tenants por estado" del dashboard. */
export const ConContador: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {SA_TENANT_STATUSES.map((status, i) => (
        <TenantStatusBadge key={status} status={status} count={(i + 1) * 3} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Activo 6')).toBeVisible()
  },
}

export const PagoVencido: Story = {
  args: { status: 'past_due' },
}

export const Bloqueado: Story = {
  args: { status: 'blocked' },
}
