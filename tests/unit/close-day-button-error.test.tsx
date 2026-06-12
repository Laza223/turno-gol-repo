// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@/app/(admin)/caja/actions', () => ({ closeDayAction: vi.fn() }))

import { CloseDayButton } from '@/app/(admin)/caja/components/CloseDayButton'
import { closeDayAction } from '@/app/(admin)/caja/actions'
import * as Sentry from '@sentry/nextjs'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => cleanup())

async function openAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(/Escribí/i, { exact: false }), {
    target: { value: 'CERRAR' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }))
  return dialog
}

describe('CloseDayButton onConfirm (#49)', () => {
  it('si closeDayAction lanza, muestra error contextual y reporta a Sentry sin romper', async () => {
    vi.mocked(closeDayAction).mockRejectedValue(new Error('db down'))

    render(<CloseDayButton date="2026-06-10" totalIncome={12000} totalExpense={2000} balance={10000} />)
    const dialog = await openAndConfirm()

    await waitFor(() => {
      expect(within(dialog).getByRole('alert').textContent).toContain('No pudimos cerrar la caja')
    })
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
  })

  it('cierre exitoso llama a closeDayAction y no muestra error', async () => {
    vi.mocked(closeDayAction).mockResolvedValue({ success: true } as never)

    render(<CloseDayButton date="2026-06-10" totalIncome={12000} totalExpense={2000} balance={10000} />)
    await openAndConfirm()

    await waitFor(() => {
      expect(vi.mocked(closeDayAction)).toHaveBeenCalledWith('2026-06-10', undefined, undefined)
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled()
  })
})
