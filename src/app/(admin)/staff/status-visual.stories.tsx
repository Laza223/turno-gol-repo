import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { StaffRoleBadge, StaffStatusBadge } from './status-visual'

/**
 * Badges de rol y estado de cuenta usados en StaffRosterView (tabla/cards).
 * `component` apunta a StaffRoleBadge; StaffStatusBadge se cubre con
 * `render` en sus propias stories — son dos exports chicos del mismo módulo,
 * no amerita separar en dos archivos.
 */
const meta = {
  title: 'Admin/Staff/StaffBadges',
  component: StaffRoleBadge,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StaffRoleBadge>

export default meta
type Story = StoryObj<typeof meta>

/** admin = único acento emerald del listado (§6.5): acceso total a Configuración. */
export const RolAdministrador: Story = {
  args: { role: 'admin' },
}

/** manager (Encargado) = tono neutro, default al invitar (DEFAULT_INVITE_ROLE). */
export const RolEncargado: Story = {
  args: { role: 'manager' },
}

// Estas 3 stories no usan `args` (el `render` propio ignora el arg de
// StaffRoleBadge) — se le pasa un `role` dummy solo para satisfacer el tipo.
export const EstadoActivo: Story = {
  args: { role: 'admin' },
  render: () => <StaffStatusBadge isActive />,
}

export const EstadoInactivo: Story = {
  args: { role: 'admin' },
  render: () => <StaffStatusBadge isActive={false} />,
}

/** Ambos badges como se ven juntos en una fila real de la tabla/cards. */
export const ParEnFila: Story = {
  args: { role: 'admin' },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <StaffRoleBadge role="admin" />
      <StaffStatusBadge isActive />
    </div>
  ),
}
