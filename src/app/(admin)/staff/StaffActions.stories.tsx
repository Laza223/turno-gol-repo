import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { StaffActions } from './StaffActions'

const ACTIVE_MANAGER = {
  memberId: '00000000-0000-4000-8000-000000000302',
  email: 'rodrigo@complejofenix.com.ar',
  firstName: 'Rodrigo',
  lastName: 'Fernández',
  isActive: true,
  role: 'manager' as const,
}

const ACTIVE_ADMIN = {
  memberId: '00000000-0000-4000-8000-000000000301',
  email: 'marcelo@complejofenix.com.ar',
  firstName: 'Marcelo',
  lastName: 'Gómez',
  isActive: true,
  role: 'admin' as const,
}

const INACTIVE_MEMBER = {
  memberId: '00000000-0000-4000-8000-000000000303',
  email: 'julieta.dominguez.belgrano@complejofenix.com.ar',
  firstName: 'Julieta',
  lastName: 'Domínguez Belgrano',
  isActive: false,
  role: 'manager' as const,
}

/**
 * Se usa dentro de una fila de tabla o card (StaffRosterView), alineado a la
 * derecha. El botón ghost y el menú Radix no dependen de un fondo específico
 * para el contraste, pero reproducimos la fila real igual (regla del
 * contenedor) para no perder el `justify-end`.
 */
const meta = {
  title: 'Admin/Staff/StaffActions',
  component: StaffActions,
  parameters: { layout: 'padded' },
  args: {
    currentUserStaffId: '00000000-0000-4000-8000-000000000999',
    activeAdminCount: 2,
    deactivateAction: fn(async () => ({ success: true as const })),
    resendInviteAction: fn(async () => ({ success: true as const })),
    updateRoleAction: fn(async () => ({ success: true as const })),
  },
  decorators: [
    (Story) => (
      <div className="flex justify-end rounded-lg border border-border bg-card p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StaffActions>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Radix DropdownMenu es modal por default: mientras está abierto, aria-oculta
 * el resto del árbol (incluido el propio trigger, que sigue siendo focusable
 * en el DOM) — confirmado que pasa igual en Design System/DropdownMenu con
 * el menú dejado abierto. Cerrar con Escape al final de cada play() evita
 * que el scan de a11y (afterEach) capture ese estado transitorio como si
 * fuera el render final.
 */

/** Encargado activo: opción de cambiar a Administrador + Desactivar habilitado. */
export const MiembroActivo: Story = {
  args: { member: ACTIVE_MANAGER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const menu = within(document.body)
    await expect(menu.findByRole('menuitem', { name: 'Cambiar a Administrador' })).resolves.toBeInTheDocument()
    await expect(menu.getByRole('menuitem', { name: 'Desactivar' })).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(menu.queryByRole('menu')).not.toBeInTheDocument())
  },
}

/** Único admin activo del complejo: lockout, "Desactivar" queda deshabilitado. */
export const UltimoAdminActivo: Story = {
  args: { member: ACTIVE_ADMIN, activeAdminCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const menu = within(document.body)
    await expect(await menu.findByRole('menuitem', { name: 'Desactivar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(menu.queryByRole('menu')).not.toBeInTheDocument())
  },
}

/** Miembro inactivo (invitación revocada): única opción es reenviar. */
export const MiembroInactivo: Story = {
  args: { member: INACTIVE_MEMBER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const menu = within(document.body)
    await expect(menu.findByRole('menuitem', { name: 'Reenviar invitación' })).resolves.toBeInTheDocument()
    await expect(menu.queryByRole('menuitem', { name: /Cambiar a/ })).toBeNull()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(menu.queryByRole('menu')).not.toBeInTheDocument())
  },
}

/** Flujo completo de desactivación: abre el menú, el ConfirmDialog exige tipear el email exacto. */
export const DesactivarRequiereEmailExacto: Story = {
  args: { member: ACTIVE_MANAGER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const body = within(document.body)
    await userEvent.click(await body.findByRole('menuitem', { name: 'Desactivar' }))

    // ConfirmDialog es un dynamic(ssr:false): findByRole espera el chunk async.
    await expect(
      await body.findByRole('heading', { name: `Desactivar ${ACTIVE_MANAGER.firstName} ${ACTIVE_MANAGER.lastName}` }),
    ).toBeInTheDocument()

    const confirmButtons = body.getAllByRole('button', { name: 'Desactivar' })
    const confirmBtn = confirmButtons[confirmButtons.length - 1]!
    await expect(confirmBtn).toBeDisabled()

    await userEvent.type(body.getByLabelText(/Escribí/i), ACTIVE_MANAGER.email)
    await expect(confirmBtn).toBeEnabled()
  },
}
