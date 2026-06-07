// @vitest-environment happy-dom
/**
 * Regression tests for RegisterMovementModal's loading-state recovery.
 *
 * The bug: the submit handler ran `await createCashFlowAction()` inside a
 * transition with no try/catch. If the action *throws* (network drop, server
 * crash) the button stayed stuck on "Guardando…" — and because
 * `handleOpenChange` bails while `isPending`, the modal also became impossible
 * to close. These tests pin that a thrown action recovers the button, surfaces
 * a readable error, and is reported to Sentry (not swallowed silently).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createCashFlowAction = vi.fn()
vi.mock('@/app/(admin)/caja/actions', () => ({
  createCashFlowAction: (...args: unknown[]) => createCashFlowAction(...args),
}))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

import { RegisterMovementModal } from '@/app/(admin)/caja/components/RegisterMovementModal'

function renderModal() {
  const onClose = vi.fn()
  render(<RegisterMovementModal open onClose={onClose} date="2026-06-10" />)
  // Fill the required fields so submit reaches the action.
  fireEvent.change(screen.getByLabelText('Monto (pesos)'), { target: { value: '100' } })
  fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Test' } })
  // Submit via the form: happy-dom doesn't bubble a click on the submit button
  // to a form submit event for this modal.
  const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }).closest('form')!)
  return { onClose, submit }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegisterMovementModal — loading recovery', () => {
  it('a thrown action does not leave the button stuck and reports to Sentry', async () => {
    createCashFlowAction.mockRejectedValueOnce(new Error('network down'))
    const { onClose, submit } = renderModal()

    submit()

    // A recoverable error is shown instead of hanging on "Guardando…".
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/no pudimos registrar el movimiento/i)
    })

    // Button is back to idle (modal no longer locked) and the failure is
    // reported to Sentry rather than swallowed silently.
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false)
    expect(captureException).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('an action returning { success:false } shows the server error without reporting', async () => {
    createCashFlowAction.mockResolvedValueOnce({ success: false, error: 'Caja cerrada' })
    const { submit } = renderModal()

    submit()

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Caja cerrada')
    })
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false)
    expect(captureException).not.toHaveBeenCalled()
  })
})
