import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { StaffActions } from './StaffActions'

const ACTIVE_MANAGER = {
  memberId: '00000000-0000-4000-8000-000000000302',
  email: 'rodrigo@complejofenix.com.ar',
  firstName: 'Rodrigo',
  lastName: 'Fernández',
  isActive: true,
  lastLoginAt: new Date('2026-08-01T12:00:00Z'),
  role: 'manager' as const,
}

const ACTIVE_ADMIN = {
  memberId: '00000000-0000-4000-8000-000000000301',
  email: 'marcelo@complejofenix.com.ar',
  firstName: 'Marcelo',
  lastName: 'Gómez',
  isActive: true,
  lastLoginAt: new Date('2026-07-15T09:30:00Z'),
  role: 'admin' as const,
}

const INACTIVE_MEMBER = {
  memberId: '00000000-0000-4000-8000-000000000303',
  email: 'julieta.dominguez.belgrano@complejofenix.com.ar',
  firstName: 'Julieta',
  lastName: 'Domínguez Belgrano',
  isActive: false,
  lastLoginAt: new Date('2026-06-01T10:00:00Z'),
  role: 'manager' as const,
}

// F-024: invitación creada, nunca aceptada — nace `isActive=true` sin login.
const PENDING_INVITE_MEMBER = {
  memberId: '00000000-0000-4000-8000-000000000304',
  email: 'nuevo.encargado@complejofenix.com.ar',
  firstName: 'Nuevo',
  lastName: 'Encargado',
  isActive: true,
  lastLoginAt: null,
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
 * Las stories dejan el menú ABIERTO a propósito cuando terminan: el scan de axe
 * (que corre después del play) tiene que ver el estado abierto, que es donde vivía
 * la violación.
 *
 * Antes había un `{Escape}` al final de cada play para cerrarlo. Eso NO era un fix:
 * era esconderle el bug al scanner. El bug era real —`StaffActions.tsx` usaba el
 * DropdownMenu con `modal=true` (el default de Radix), que llama `hideOthers()` y
 * marca aria-hidden todo el árbol fuera del portal, incluido el propio trigger, que
 * sigue siendo focuseable— y ahora está arreglado de raíz con `modal={false}` en el
 * componente. Si estas stories vuelven a fallar por aria-hidden-focus, es que alguien
 * revirtió ese fix.
 */

/** Encargado activo: opción de cambiar a Administrador + Desactivar habilitado. */
export const MiembroActivo: Story = {
  args: { member: ACTIVE_MANAGER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const menu = within(document.body)
    await expect(
      menu.findByRole('menuitem', { name: 'Cambiar a Administrador' }),
    ).resolves.toBeInTheDocument()
    await expect(menu.getByRole('menuitem', { name: 'Desactivar' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
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
  },
}

/** Miembro inactivo (invitación revocada): única opción es reenviar. */
export const MiembroInactivo: Story = {
  args: { member: INACTIVE_MEMBER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const menu = within(document.body)
    await expect(
      menu.findByRole('menuitem', { name: 'Reenviar invitación' }),
    ).resolves.toBeInTheDocument()
    await expect(menu.queryByRole('menuitem', { name: /Cambiar a/ })).toBeNull()
  },
}

/**
 * Invitación creada, nunca aceptada (F-024): `isActive=true` sin `lastLoginAt`.
 * A diferencia de un activo normal, también ofrece "Reenviar invitación" —
 * JUNTO con cambiar rol/desactivar, no en su lugar (a diferencia del inactivo).
 */
export const InvitacionPendiente: Story = {
  args: { member: PENDING_INVITE_MEMBER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Opciones' }))
    const menu = within(document.body)
    await expect(
      menu.findByRole('menuitem', { name: 'Reenviar invitación' }),
    ).resolves.toBeInTheDocument()
    await expect(
      menu.getByRole('menuitem', { name: 'Cambiar a Administrador' }),
    ).toBeInTheDocument()
    await expect(menu.getByRole('menuitem', { name: 'Desactivar' })).toBeInTheDocument()
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
      await body.findByRole('heading', {
        name: `Desactivar ${ACTIVE_MANAGER.firstName} ${ACTIVE_MANAGER.lastName}`,
      }),
    ).toBeInTheDocument()

    const confirmButtons = body.getAllByRole('button', { name: 'Desactivar' })
    const confirmBtn = confirmButtons[confirmButtons.length - 1]!
    await expect(confirmBtn).toBeDisabled()

    await userEvent.type(body.getByLabelText(/Escribí/i), ACTIVE_MANAGER.email)
    await expect(confirmBtn).toBeEnabled()
  },
}
