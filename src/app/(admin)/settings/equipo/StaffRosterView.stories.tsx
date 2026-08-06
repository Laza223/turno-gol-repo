import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { staffInactive, staffManager, staffMember, type StaffMember } from '@/test/fixtures/staff'
import { StaffRosterView, type StaffRosterMember } from './StaffRosterView'

const toRosterMember = (m: StaffMember): StaffRosterMember => ({
  memberId: m.id,
  staffUserId: m.staffUserId,
  firstName: m.firstName,
  lastName: m.lastName,
  email: m.email,
  role: m.role,
  isActive: m.isActive,
})

const ADMIN = staffMember() // Marcelo — el actor logueado en todas las stories.
const ROSTER = [ADMIN, staffManager(), staffInactive()].map(toRosterMember)

/**
 * Vista Equipo completa (extraída de staff/page.tsx). Reproduce el contenedor
 * real: `content-area-gradient` es el fondo del `<main>` del shell admin
 * (admin-layout-shell.tsx), donde vive esta vista sin ningún wrapper propio.
 */
const meta = {
  title: 'Admin/Staff/StaffRosterView',
  component: StaffRosterView,
  parameters: { layout: 'fullscreen' },
  args: {
    staffUserId: ADMIN.staffUserId,
    inviteAction: fn(async () => ({ success: true as const })),
    deactivateAction: fn(async () => ({ success: true as const })),
    resendInviteAction: fn(async () => ({ success: true as const })),
    updateRoleAction: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <div className="content-area-gradient min-h-screen w-full px-4 py-8 sm:px-6 lg:px-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaffRosterView>

export default meta
type Story = StoryObj<typeof meta>

/** Roster mixto: admin logueado (vos, sin acciones), encargado activo y ex-encargada inactiva. */
export const Default: Story = {
  args: { members: ROSTER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Solo 2 de los 3 miembros muestran StaffActions: el propio admin (self) no.
    await expect(canvas.getAllByRole('button', { name: 'Opciones' })).toHaveLength(2)
  },
}

export const SinMiembros: Story = {
  args: { members: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('heading', { name: /sin miembros de equipo/i })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /invitar al primer miembro/i })).toBeInTheDocument()
  },
}

/** Complejo recién onboardeado: un único admin (el propio actor), sin StaffActions en ninguna fila. */
export const UnSoloMiembro: Story = {
  args: { members: [toRosterMember(ADMIN)] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1 miembro del equipo activo')).toBeInTheDocument()
    await expect(canvas.queryAllByRole('button', { name: 'Opciones' })).toHaveLength(0)
  },
}
