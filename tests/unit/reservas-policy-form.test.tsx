// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TenantSettings } from '@/modules/tenants/tenant.types'

// useActionState/useFormStatus son undefined en vitest: los mockeamos para
// testear la presentacion del feedback (#21).
//
// React 19: useFormState (react-dom) pasó a ser useActionState (react), así que
// el mock tiene que ir a 'react'. useFormStatus NO se movió: sigue en react-dom.
const formState = vi.fn()
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (_action: unknown, initial: unknown) => [
      formState() ?? initial,
      vi.fn(),
      false,
    ],
  }
})
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  }
})

import { ReservasPolicyForm } from '@/app/(admin)/settings/reservas/ReservasPolicyForm'

const SETTINGS = {} as unknown as TenantSettings

// Ya no hace falta un vi.mock de '@/app/(admin)/settings/reservas/actions' para
// evitar que drizzle/postgres se carguen al importar el componente: la Server
// Action entra por prop, así que el componente directamente no la importa.
const noopAction = vi.fn(async () => ({ success: true as const }))

afterEach(() => cleanup())

describe('ReservasPolicyForm (#21)', () => {
  it('muestra el error cuando la action devuelve success:false', () => {
    formState.mockReturnValue({ success: false, error: 'PIN requerido.' })
    render(<ReservasPolicyForm s={SETTINGS} action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('PIN requerido.')
  })

  it('no muestra alerta de error cuando el estado es success', () => {
    formState.mockReturnValue({ success: true })
    render(<ReservasPolicyForm s={SETTINGS} action={noopAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
