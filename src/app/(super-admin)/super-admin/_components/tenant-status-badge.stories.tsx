import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SA_TENANT_STATUSES } from '@/test/fixtures/super-admin'
import { TenantStatusBadge } from './tenant-status-badge'

/**
 * Badge de estado del dashboard global (grilla "Tenants por estado" + lista de
 * signups recientes). Soporta un `count` opcional que su casi-gemelo de
 * `tenants/_components/status-badge.tsx` no tiene — ver la nota de
 * `isolationNotes` del inventario sobre consolidar ambos en el design system.
 */
const meta = {
  title: 'SuperAdmin/Dashboard/TenantStatusBadge',
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

/** Con contador — como en "Tenants por estado" del dashboard. */
export const ConContador: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {SA_TENANT_STATUSES.map((status, i) => (
        <TenantStatusBadge key={status} status={status} count={(i + 1) * 3} />
      ))}
    </div>
  ),
}

export const SinContador: Story = {
  args: { status: 'past_due' },
}
