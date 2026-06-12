// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

vi.mock('@/app/(admin)/staff/actions', () => ({
  deactivateStaffAction: vi.fn(),
  resendInviteAction: vi.fn(),
  updateStaffRoleAction: vi.fn().mockResolvedValue({ success: true }),
}))

import { StaffActions } from '@/app/(admin)/staff/StaffActions'
import { updateStaffRoleAction } from '@/app/(admin)/staff/actions'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderActions(
  overrides: Partial<{
    role: 'admin' | 'manager' | 'read_only'
    isActive: boolean
    activeAdminCount: number
  }> = {},
) {
  return render(
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
    />,
  )
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: /Opciones/ })
  // Radix DropdownMenu abre con teclado (Enter); el pointerdown real de un
  // mouse no se simula bien en happy-dom.
  fireEvent.keyDown(trigger, { key: 'Enter' })
  await waitFor(() => screen.getByRole('menu'))
}

describe('StaffActions — cambio de rol', () => {
  it('ofrece cambiar a los otros 2 roles, nunca al rol actual', async () => {
    renderActions({ role: 'manager' })
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /Cambiar a Administrador/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Cambiar a Solo lectura/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Cambiar a Encargado/ })).toBeNull()
  })

  it('invoca updateStaffRoleAction con el memberId y el rol elegido', async () => {
    renderActions({ role: 'read_only' })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Cambiar a Encargado/ }))
    await waitFor(() => {
      expect(updateStaffRoleAction).toHaveBeenCalledWith('member-1', 'manager')
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
