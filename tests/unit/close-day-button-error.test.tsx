// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { CloseDayButton } from '@/app/(admin)/caja/components/CloseDayButton'
import * as Sentry from '@sentry/nextjs'

// closeDayAction ya no se importa del módulo — CloseDayButton la recibe por
// prop (ver el comentario en CloseDayButton.tsx).
const closeDayAction = vi.fn()

function renderButton() {
  return render(
    <CloseDayButton
      date="2026-06-10"
      tenantId="t-1"
      totalIncome={12000}
      totalExpense={2000}
      balance={10000}
      cashTotal={10000}
      expectedCash={10000}
      openingCash={null}
      closeDayAction={closeDayAction}
    />,
  )
}

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
    closeDayAction.mockRejectedValue(new Error('db down'))

    renderButton()
    const dialog = await openAndConfirm()

    await waitFor(() => {
      expect(within(dialog).getByRole('alert').textContent).toContain('No pudimos cerrar la caja')
    })
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledTimes(1)
  })

  it('cierre exitoso llama a closeDayAction y no muestra error', async () => {
    closeDayAction.mockResolvedValue({ success: true })

    renderButton()
    await openAndConfirm()

    await waitFor(() => {
      expect(closeDayAction).toHaveBeenCalledWith('2026-06-10', undefined, undefined)
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled()
  })
})
