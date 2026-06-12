// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { StaffActionResult } from '@/app/(admin)/staff/actions'

// useFormState / useFormStatus no existen en el runtime de vitest (requieren el
// runtime de Server Actions de Next). Mock para testear solo la PRESENTACIÓN.
let mockState: StaffActionResult | null = null

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormState: (_action: unknown, _initial: unknown) => [mockState, () => {}],
    useFormStatus: () => ({ pending: false }),
  }
})

import { InviteStaffDialog } from '@/app/(admin)/staff/InviteStaffDialog'

afterEach(() => {
  cleanup()
  mockState = null
})

function renderDialog() {
  return render(
    <InviteStaffDialog inviteAction={vi.fn()} onClose={vi.fn()} />,
  )
}

describe('InviteStaffDialog — selección de rol', () => {
  it('ofrece los 3 roles fijos como radios', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: /Administrador/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Encargado/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Solo lectura/ })).toBeTruthy()
  })

  it('arranca con Encargado seleccionado (default), no Administrador', () => {
    renderDialog()
    const encargado = screen.getByRole('radio', { name: /Encargado/ }) as HTMLInputElement
    const admin = screen.getByRole('radio', { name: /Administrador/ }) as HTMLInputElement
    expect(encargado.checked).toBe(true)
    expect(admin.checked).toBe(false)
  })

  it('los radios postean bajo name="role" con los valores del enum', () => {
    renderDialog()
    const encargado = screen.getByRole('radio', { name: /Encargado/ }) as HTMLInputElement
    expect(encargado.name).toBe('role')
    expect(encargado.value).toBe('manager')
    const admin = screen.getByRole('radio', { name: /Administrador/ }) as HTMLInputElement
    expect(admin.value).toBe('admin')
    const lectura = screen.getByRole('radio', { name: /Solo lectura/ }) as HTMLInputElement
    expect(lectura.value).toBe('read_only')
  })
})
