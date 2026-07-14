import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SA_TENANT_STATUSES } from '@/test/fixtures/super-admin'
import { TenantStatusBadge } from './status-badge'

/**
 * Badge de estado de la lista/detalle de tenants. Casi-gemelo de
 * `_components/tenant-status-badge.tsx` (dashboard): mismo set de 8 estados
 * pero copy distinta ("Pago vencido" vs "Moroso") y SIN soporte de `count`.
 * Se storea aparte porque cada uno vive en una vista distinta del panel.
 */
const meta = {
  title: 'SuperAdmin/Tenants/TenantStatusBadge',
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
}

export const PagoVencido: Story = {
  args: { status: 'past_due' },
}

export const Bloqueado: Story = {
  args: { status: 'blocked' },
}
