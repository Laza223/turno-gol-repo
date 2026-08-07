// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

import { StaffActions } from '@/app/(admin)/settings/equipo/StaffActions'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderActions(
  overrides: Partial<{
    role: 'admin' | 'manager'
    isActive: boolean
    activeAdminCount: number
  }> = {},
) {
  // Las Server Actions entran por prop (ver ReservasPolicyForm.tsx).
  const updateRoleAction = vi.fn().mockResolvedValue({ success: true })
  return {
    updateRoleAction,
    ...render(
      <StaffActions
        member={{
          memberId: 'member-1',
          email: 'miembro@test.local',
          firstName: 'Mi',
          lastName: 'Embro',
          isActive: overrides.isActive ?? true,
          role: overrides.role ?? 'manager',
        }}
        currentUserStaffId="staff-yo"
        activeAdminCount={overrides.activeAdminCount ?? 2}
        deactivateAction={vi.fn()}
        resendInviteAction={vi.fn()}
        updateRoleAction={updateRoleAction}
      />,
    ),
  }
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: /Opciones/ })
  // Radix DropdownMenu abre con teclado (Enter); el pointerdown real de un
  // mouse no se simula bien en happy-dom.
  fireEvent.keyDown(trigger, { key: 'Enter' })
  await waitFor(() => screen.getByRole('menu'))
}

describe('StaffActions — cambio de rol', () => {
  it('ofrece cambiar al otro rol, nunca al rol actual', async () => {
    renderActions({ role: 'manager' })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /Cambiar a Administrador/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Cambiar a Encargado/ })).toBeNull()
  })

  it('invoca updateRoleAction con el memberId y el rol elegido', async () => {
    const { updateRoleAction } = renderActions({ role: 'admin' })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Cambiar a Encargado/ }))
    await waitFor(() => {
      expect(updateRoleAction).toHaveBeenCalledWith('member-1', 'manager')
    })
  })

  it('no ofrece cambio de rol para un miembro inactivo', async () => {
    renderActions({ isActive: false })
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: /Cambiar a/ })).toBeNull()
  })

  it('deshabilita Desactivar para el último admin activo', async () => {
    renderActions({ role: 'admin', activeAdminCount: 1 })
    await openMenu()
    const item = screen.getByRole('menuitem', { name: /Desactivar/ })
    expect(item.getAttribute('aria-disabled')).toBe('true')
  })

  it('habilita Desactivar para un encargado aunque haya un solo admin', async () => {
    renderActions({ role: 'manager', activeAdminCount: 1 })
    await openMenu()
    const item = screen.getByRole('menuitem', { name: /Desactivar/ })
    expect(item.getAttribute('aria-disabled')).not.toBe('true')
  })
})
