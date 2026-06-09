// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// useFormState/useFormStatus son undefined en vitest: mock para testear la
// presentacion del feedback (#19).
const formState = vi.fn()
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
    useFormState: (_action: unknown, initial: unknown) => [formState() ?? initial, vi.fn()],
  }
})

// Evitar cargar las Server Actions reales (drizzle/db) al importar el componente.
vi.mock('@/app/(admin)/settings/horarios/actions', () => ({
  updateHorariosAction: vi.fn(),
  addClosedDateAction: vi.fn(),
  removeClosedDateAction: vi.fn(),
}))

import {
  AddClosedDateForm,
  HorariosForm,
  RemoveClosedDateForm,
} from '@/app/(admin)/settings/horarios/HorariosForms'

afterEach(() => cleanup())

describe('HorariosForms — feedback (#19)', () => {
  it('HorariosForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'Formato HH:MM' })
    render(<HorariosForm hours={{}} />)
    expect(screen.getByRole('alert').textContent).toContain('Formato HH:MM')
  })

  it('AddClosedDateForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'Fecha inválida.' })
    render(<AddClosedDateForm minDate="2026-06-09" />)
    expect(screen.getByRole('alert').textContent).toContain('Fecha inválida.')
  })

  it('RemoveClosedDateForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'PIN requerido.' })
    render(<RemoveClosedDateForm date="2026-06-09" />)
    expect(screen.getByRole('alert').textContent).toContain('PIN requerido.')
  })

  it('sin error no renderiza ninguna alerta', () => {
    formState.mockReturnValue({ success: true })
    render(<HorariosForm hours={{}} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
