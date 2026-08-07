// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

import { StaffActions } from '@/app/(admin)/settings/equipo/StaffActions'
import { toast } from '@/hooks/use-toast'

const ACTIVE_MEMBER = {
  memberId: 'mmmmmmmm-0000-0000-0000-000000000001',
  email: 'jose.perez@test.com',
  firstName: 'José',
  lastName: 'Pérez',
  isActive: true,
  role: 'admin' as const,
}

const INACTIVE_MEMBER = {
  memberId: 'mmmmmmmm-0000-0000-0000-000000000002',
  email: 'laura.gomez@test.com',
  firstName: 'Laura',
  lastName: 'Gómez',
  isActive: false,
  role: 'manager' as const,
}

const CURRENT_USER_STAFF_ID = 'uuuuuuuu-0000-0000-0000-000000000001'

type MemberProp = Parameters<typeof StaffActions>[0]['member']

// Las Server Actions entran por prop (ver ReservasPolicyForm.tsx) — mocks
// locales en vez de vi.mock('.../staff/actions').
let deactivateAction: ReturnType<typeof vi.fn>
let resendInviteActionMock: ReturnType<typeof vi.fn>
let updateRoleAction: ReturnType<typeof vi.fn>

/** Open the dropdown for the given member and return the menu content node. */
async function openDropdown(member: MemberProp, activeAdminCount = 3) {
  render(
    <StaffActions
      member={member}
      currentUserStaffId={CURRENT_USER_STAFF_ID}
      activeAdminCount={activeAdminCount}
      deactivateAction={deactivateAction}
      resendInviteAction={resendInviteActionMock}
      updateRoleAction={updateRoleAction}
    />,
  )
  const trigger = screen.getByRole('button', { name: 'Opciones' })
  // Simulate pointer-down + click to trigger Radix open
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)
  // Radix appends menu to document.body portal; query from body
  await waitFor(() => {
    expect(within(document.body).queryAllByRole('menuitem').length).toBeGreaterThan(0)
  })
  return within(document.body)
}

beforeEach(() => {
  vi.clearAllMocks()
  deactivateAction = vi.fn()
  resendInviteActionMock = vi.fn()
  updateRoleAction = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('StaffActions — dropdown rendering', () => {
  it('renders the trigger button with accessible label', () => {
    render(
      <StaffActions
        member={ACTIVE_MEMBER}
        currentUserStaffId={CURRENT_USER_STAFF_ID}
        activeAdminCount={3}
        deactivateAction={deactivateAction}
        resendInviteAction={resendInviteActionMock}
        updateRoleAction={updateRoleAction}
      />,
    )
    expect(screen.getByRole('button', { name: 'Opciones' })).toBeTruthy()
  })

  it('active member shows "Desactivar" in dropdown', async () => {
    const body = await openDropdown(ACTIVE_MEMBER)
    expect(body.getByRole('menuitem', { name: 'Desactivar' })).toBeTruthy()
  })

  it('inactive member shows "Reenviar invitación" in dropdown', async () => {
    const body = await openDropdown(INACTIVE_MEMBER)
    expect(body.getByRole('menuitem', { name: 'Reenviar invitación' })).toBeTruthy()
  })
})

describe('StaffActions — deactivate dialog', () => {
  it('clicking "Desactivar" opens the ConfirmDialog', async () => {
    const body = await openDropdown(ACTIVE_MEMBER)
    const item = body.getByRole('menuitem', { name: 'Desactivar' })
    fireEvent.click(item)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: `Desactivar ${ACTIVE_MEMBER.firstName} ${ACTIVE_MEMBER.lastName}`,
        }),
      ).toBeTruthy()
    })
  })

  it('typing wrong email keeps confirm disabled', async () => {
    const body = await openDropdown(ACTIVE_MEMBER)
    fireEvent.click(body.getByRole('menuitem', { name: 'Desactivar' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Desactivar/ })).toBeTruthy()
    })

    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: 'wrong@email.com' } })

    // The confirm button label inside the dialog is "Desactivar"
    const buttons = screen.getAllByRole('button', { name: 'Desactivar' })
    // The dialog confirm button is the last one rendered
    const confirmBtn = buttons[buttons.length - 1] as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })

  it('typing exact email enables confirm button', async () => {
    const body = await openDropdown(ACTIVE_MEMBER)
    fireEvent.click(body.getByRole('menuitem', { name: 'Desactivar' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Desactivar/ })).toBeTruthy()
    })

    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: ACTIVE_MEMBER.email } })

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: 'Desactivar' })
      const confirmBtn = buttons[buttons.length - 1] as HTMLButtonElement
      expect(confirmBtn.disabled).toBe(false)
    })
  })

  it('server error keeps dialog open and surfaces error message', async () => {
    deactivateAction.mockResolvedValue({
      success: false,
      error: 'El complejo debe tener al menos un administrador activo.',
    })

    const body = await openDropdown(ACTIVE_MEMBER)
    fireEvent.click(body.getByRole('menuitem', { name: 'Desactivar' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Desactivar/ })).toBeTruthy()
    })

    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: ACTIVE_MEMBER.email } })

    const buttons = screen.getAllByRole('button', { name: 'Desactivar' })
    const confirmBtn = buttons[buttons.length - 1] as HTMLButtonElement
    await waitFor(() => { expect(confirmBtn.disabled).toBe(false) })

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('El complejo debe tener al menos un administrador activo.')
    })

    // Dialog stays open
    expect(screen.getByRole('heading', { name: /Desactivar/ })).toBeTruthy()
  })

  it('successful deactivate calls deactivateAction and closes dialog', async () => {
    deactivateAction.mockResolvedValue({ success: true })

    const body = await openDropdown(ACTIVE_MEMBER)
    fireEvent.click(body.getByRole('menuitem', { name: 'Desactivar' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Desactivar/ })).toBeTruthy()
    })

    const phraseInput = screen.getByLabelText(/Escribí/i) as HTMLInputElement
    fireEvent.change(phraseInput, { target: { value: ACTIVE_MEMBER.email } })

    const buttons = screen.getAllByRole('button', { name: 'Desactivar' })
    const confirmBtn = buttons[buttons.length - 1] as HTMLButtonElement
    await waitFor(() => { expect(confirmBtn.disabled).toBe(false) })

    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(deactivateAction).toHaveBeenCalledWith(ACTIVE_MEMBER.memberId)
    })

    // Dialog should be closed (heading gone)
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Desactivar/ })).toBeNull()
    })
  })
})

describe('StaffActions — resend invite', () => {
  it('clicking "Reenviar invitación" calls resendInviteAction and shows success toast', async () => {
    resendInviteActionMock.mockResolvedValue({ success: true })

    const body = await openDropdown(INACTIVE_MEMBER)
    fireEvent.click(body.getByRole('menuitem', { name: 'Reenviar invitación' }))

    await waitFor(() => {
      expect(resendInviteActionMock).toHaveBeenCalledWith(INACTIVE_MEMBER.email)
    })

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      )
    })
  })

  it('resend error shows destructive toast', async () => {
    resendInviteActionMock.mockResolvedValue({
      success: false,
      error: 'Error reenviando invitación: usuario no encontrado.',
    })

    const body = await openDropdown(INACTIVE_MEMBER)
    fireEvent.click(body.getByRole('menuitem', { name: 'Reenviar invitación' }))

    await waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      )
    })
  })
})
