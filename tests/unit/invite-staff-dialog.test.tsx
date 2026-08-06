// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { StaffActionResult } from '@/app/(admin)/settings/equipo/actions'

// useActionState / useFormStatus no existen en el runtime de vitest (requieren
// el runtime de Server Actions de Next). Mock para testear solo la PRESENTACIÓN.
//
// React 19: useFormState (react-dom) pasó a ser useActionState (react), así que
// el mock tiene que ir a 'react'. useFormStatus NO se movió: sigue en react-dom.
let mockState: StaffActionResult | null = null

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (_action: unknown, _initial: unknown) => [mockState, () => {}, false],
  }
})

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  }
})

import { InviteStaffDialog } from '@/app/(admin)/settings/equipo/InviteStaffDialog'

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
  it('ofrece los 2 roles fijos como radios', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: /Administrador/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Encargado/ })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Solo lectura/ })).toBeNull()
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
  })
})
