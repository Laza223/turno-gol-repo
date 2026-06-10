// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

// useFormState/useFormStatus son undefined en vitest: los mockeamos para testear
// la presentacion del feedback (#21).
const formState = vi.fn()
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
    useFormState: (_action: unknown, initial: unknown) => [formState() ?? initial, vi.fn()],
  }
})

// Evitar cargar la Server Action real (drizzle/db) al importar el componente.
vi.mock('@/app/(admin)/settings/reservas/actions', () => ({
  updateReservasPolicyAction: vi.fn(),
}))

import { ReservasPolicyForm } from '@/app/(admin)/settings/reservas/ReservasPolicyForm'

const SETTINGS = {} as unknown as TenantSettings

afterEach(() => cleanup())

describe('ReservasPolicyForm (#21)', () => {
  it('muestra el error cuando la action devuelve success:false', () => {
    formState.mockReturnValue({ success: false, error: 'PIN requerido.' })
    render(<ReservasPolicyForm s={SETTINGS} />)
    expect(screen.getByRole('alert').textContent).toContain('PIN requerido.')
  })

  it('no muestra alerta de error cuando el estado es success', () => {
    formState.mockReturnValue({ success: true })
    render(<ReservasPolicyForm s={SETTINGS} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
