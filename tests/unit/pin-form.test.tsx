// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { PinConfigResult } from '@/app/(admin)/settings/pin/actions'

// useFormState / useFormStatus de react-dom no están disponibles en el runtime de
// vitest (requieren el runtime de Server Actions de Next). Los mockeamos para
// controlar el estado y verificar la PRESENTACIÓN del resultado — que es lo que
// arregla el BLOCKER (triage_fixes #5): la UI antes descartaba {success,error}.
let mockState: PinConfigResult = { success: false, error: '' }

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormState: (_action: unknown, _initial: unknown) => [mockState, () => {}],
    useFormStatus: () => ({ pending: false }),
  }
})

// Mock de la server action (no se invoca en estos tests, pero PinForm la importa).
vi.mock('@/app/(admin)/settings/pin/actions', () => ({
  setPinAction: vi.fn(),
}))

import { PinForm } from '@/app/(admin)/settings/pin/PinForm'

beforeEach(() => {
  mockState = { success: false, error: '' }
})

afterEach(() => {
  cleanup()
})

describe('PinForm', () => {
  it('no muestra alert ni status en el estado inicial', () => {
    mockState = { success: false, error: '' }
    render(<PinForm hasPin={false} />)
    expect(screen.getByRole('button', { name: 'Configurar PIN' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('muestra el error devuelto por setPinAction en un role="alert"', () => {
    mockState = { success: false, error: 'PIN actual incorrecto.' }
    render(<PinForm hasPin={true} />)
    expect(screen.getByRole('alert').textContent).toContain('PIN actual incorrecto.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('muestra confirmación de éxito en un role="status"', () => {
    mockState = { success: true }
    render(<PinForm hasPin={false} />)
    expect(screen.getByRole('status').textContent).toMatch(/PIN actualizado/)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
