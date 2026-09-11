// @vitest-environment happy-dom
/**
 * Contratos de render del modal de movimiento (pages/caja.md §7): cambiar
 * tipo re-selecciona la primera categoría válida (VALID_COMBOS) y el payload
 * de la action sale coherente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

// createCashFlowAction ya no se importa del módulo — RegisterMovementModal la
// recibe por prop (ver el comentario en RegisterMovementModal.tsx).
const createCashFlowAction = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { RegisterMovementModal } from '@/app/(admin)/caja/cantina/RegisterMovementModal'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('RegisterMovementModal — chips', () => {
  // migr. 050: 'operating_expense' ya no es la única categoría de gasto — la
  // UI ofrece 5 categorías específicas (Mercadería/Sueldos/Servicios/
  // Mantenimiento/Otro gasto); operating_expense queda legacy, display-only.
  it('elegir "Gasto" muestra las 5 categorías nuevas y auto-selecciona "Mercadería"', () => {
    render(
      <RegisterMovementModal
        open
        onClose={vi.fn()}
        date="2026-06-10"
        cutoffMins={0}
        createCashFlowAction={createCashFlowAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gasto' }))
    expect(pressed('Mercadería')).toBe('true')

    // Las 5 categorías nuevas están visibles como chips; 'Gasto operativo'
    // (legacy) NUNCA se ofrece desde esta UI (categoryLabel lo sigue traduciendo
    // para el historial, pero el modal no lo incluye en CATEGORIES.expense).
    for (const label of ['Mercadería', 'Sueldos', 'Servicios', 'Mantenimiento', 'Otro gasto']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'Gasto operativo' })).toBeNull()
  })

  it('el payload de "Gasto" sin re-elegir categoría sale con category: merchandise', async () => {
    createCashFlowAction.mockResolvedValueOnce({ success: true, cashFlow: {} })
    render(
      <RegisterMovementModal
        open
        onClose={vi.fn()}
        date="2026-06-10"
        cutoffMins={0}
        createCashFlowAction={createCashFlowAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gasto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }))
    fireEvent.change(screen.getByLabelText('Monto (pesos)'), { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Hielo' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)

    await waitFor(() => expect(createCashFlowAction).toHaveBeenCalledOnce())
    expect(createCashFlowAction.mock.calls[0]![0]).toMatchObject({
      type: 'expense',
      category: 'merchandise',
      method: 'transfer',
      amount: 123400,
      description: 'Hielo',
    })
  })

  it('dentro de "Gasto" se puede elegir otra categoría (ej. Sueldos) y el payload la refleja', async () => {
    createCashFlowAction.mockResolvedValueOnce({ success: true, cashFlow: {} })
    render(
      <RegisterMovementModal
        open
        onClose={vi.fn()}
        date="2026-06-10"
        cutoffMins={0}
        createCashFlowAction={createCashFlowAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gasto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sueldos' }))
    expect(pressed('Sueldos')).toBe('true')
    fireEvent.change(screen.getByLabelText('Monto (pesos)'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Sueldo cadete' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)

    await waitFor(() => expect(createCashFlowAction).toHaveBeenCalledOnce())
    expect(createCashFlowAction.mock.calls[0]![0]).toMatchObject({
      type: 'expense',
      category: 'salaries',
    })
  })

  it('volver a "Ingreso" re-selecciona "Reserva" (nunca queda una categoría de otro tipo)', () => {
    render(
      <RegisterMovementModal
        open
        onClose={vi.fn()}
        date="2026-06-10"
        cutoffMins={0}
        createCashFlowAction={createCashFlowAction}
      />,
    )

    expect(pressed('Reserva')).toBe('true') // default
    fireEvent.click(screen.getByRole('button', { name: 'Ajuste' }))
    expect(pressed('Corrección por ausencia')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ingreso' }))
    expect(pressed('Reserva')).toBe('true')
  })
})
