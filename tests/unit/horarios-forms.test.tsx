// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { HorariosActionResult } from '@/app/(admin)/settings/horarios/actions'

// useActionState/useFormStatus son undefined en vitest: mock para testear la
// presentacion del feedback (#19).
//
// React 19: useFormState (react-dom) pasó a ser useActionState (react), así que
// el mock tiene que ir a 'react'. useFormStatus NO se movió: sigue en react-dom.
// Ojo: si esto se dejara sólo en react-dom, el mock dejaría de interceptar y el
// test seguiría en verde sin testear nada.
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

import { AddClosedDateForm } from '@/app/(admin)/settings/horarios/AddClosedDateForm'
import { HorariosForm } from '@/app/(admin)/settings/horarios/HorariosForm'
import { RemoveClosedDateForm } from '@/app/(admin)/settings/horarios/RemoveClosedDateForm'

afterEach(() => cleanup())

// Ya no hace falta un vi.mock de '.../horarios/actions' para evitar cargar
// drizzle/postgres al importar los componentes: las Server Actions entran por
// prop (ver ReservasPolicyForm.tsx).
const noopAction = vi.fn(async (): Promise<HorariosActionResult> => ({ success: true }))

describe('HorariosForms — feedback (#19)', () => {
  it('HorariosForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'Formato HH:MM' })
    render(<HorariosForm hours={{}} closesNextDay={false} action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('Formato HH:MM')
  })

  it('AddClosedDateForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'Fecha inválida.' })
    render(<AddClosedDateForm minDate="2026-06-09" action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('Fecha inválida.')
  })

  it('RemoveClosedDateForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'PIN requerido.' })
    render(<RemoveClosedDateForm date="2026-06-09" action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('PIN requerido.')
  })

  it('sin error no renderiza ninguna alerta', () => {
    formState.mockReturnValue({ success: true })
    render(<HorariosForm hours={{}} closesNextDay={false} action={noopAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
