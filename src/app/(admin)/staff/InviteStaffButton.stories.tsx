import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PageHeader } from '@/components/admin/PageHeader'
import { UserCog } from 'lucide-react'
import { InviteStaffButton } from './InviteStaffButton'

/**
 * En la página real (staff/page.tsx vía StaffRosterView) el botón vive en el
 * slot `actions` de PageHeader, sobre `.page-header-band` — se reproduce acá
 * porque es el único contexto en el que se usa (regla del contenedor real).
 */
const meta = {
  title: 'Admin/Staff/InviteStaffButton',
  component: InviteStaffButton,
  parameters: { layout: 'padded' },
  args: {
    inviteAction: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <PageHeader
        title="Equipo"
        subtitle="3 miembros del equipo activos"
        icon={<UserCog className="h-6 w-6" aria-hidden="true" />}
        actions={<Story />}
      />
    ),
  ],
} satisfies Meta<typeof InviteStaffButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Empty state (staff/page.tsx): label override para no repetir el texto del botón del PageHeader. */
export const LabelDeEmptyState: Story = {
  args: { label: 'Invitar al primer miembro' },
}

export const AbreElDialogo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /agregar miembro del equipo/i }))
    await expect(
      within(document.body).getByRole('heading', { name: /invitar miembro del equipo/i }),
    ).toBeInTheDocument()
  },
}
