// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { CobrarSenaButton } from '@/components/booking/CobrarSenaButton'

// `formatArs` mete un NBSP (U+00A0) entre "$" y el número. A diferencia de
// `getByText` (cuyo normalizer colapsa el NBSP del DOM pero no el string que
// uno le pasa), el nombre accesible de `getByRole` SÍ conserva el NBSP tal
// cual: acá el matcher tiene que llevarlo, no reemplazarlo por un espacio.
const money = formatArs

/**
 * "Cobrar seña $X" (paso 3, docs/decisions/2026-09-24-navegacion-panel.md):
 * mudado de `reservas-quick-actions.test.tsx` → "Confirmar pago" — la única
 * puerta a `confirmDepositPaymentAction` ahora es este componente compartido
 * (modal de Hoy/Grilla y página del turno), no la fila de /reservas.
 */
afterEach(() => {
  cleanup()
  vi.mocked(toast).mockClear()
})

describe('CobrarSenaButton', () => {
  it('abre el diálogo con Efectivo por defecto y llama a la acción con (id, "cash")', async () => {
    const confirmDepositPaymentAction = vi.fn(async () => ({ success: true as const }))
    render(
      <CobrarSenaButton
        bookingId="b1"
        depositAmount={450_000}
        confirmDepositPaymentAction={confirmDepositPaymentAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: `Cobrar seña ${money(450_000)}` }))

    const dialog = await screen.findByRole('dialog', { name: 'Cobrar seña' })
    expect(within(dialog).getByRole('radio', { name: 'Efectivo' })).toBeChecked()

    fireEvent.click(within(dialog).getByRole('button', { name: `Cobrar ${money(450_000)}` }))

    await waitFor(() => expect(confirmDepositPaymentAction).toHaveBeenCalledWith('b1', 'cash'))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Seña cobrada', variant: 'success' }),
      ),
    )
  })

  it('muestra el error si la acción falla, y el diálogo queda abierto', async () => {
    const confirmDepositPaymentAction = vi.fn(async () => ({
      success: false as const,
      error: 'La reserva ya no está pendiente de pago.',
    }))
    render(
      <CobrarSenaButton
        bookingId="b1"
        depositAmount={450_000}
        confirmDepositPaymentAction={confirmDepositPaymentAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: `Cobrar seña ${money(450_000)}` }))
    const dialog = await screen.findByRole('dialog', { name: 'Cobrar seña' })
    fireEvent.click(within(dialog).getByRole('button', { name: `Cobrar ${money(450_000)}` }))

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'La reserva ya no está pendiente de pago.',
      ),
    )
    expect(screen.getByRole('dialog', { name: 'Cobrar seña' })).toBeInTheDocument()
  })
})
