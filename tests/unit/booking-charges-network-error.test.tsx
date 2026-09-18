// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import BookingCharges from '@/app/(admin)/reservas/[id]/BookingCharges'
import type {
  AddBookingChargeInput,
  BookingChargeActionResult,
} from '@/app/(admin)/reservas/actions'

/**
 * Detalle de reserva (/reservas/[id]). Armaba una clientIdempotencyKey NUEVA en
 * cada toque de "Registrar cobro": si la request se cortaba por la red pero el
 * cobro entraba, el reintento viajaba con otra key y el servidor lo insertaba
 * de nuevo. Mismo problema de fondo que el panel de la grilla (PR #328), al
 * revés: allá la key sobrevivía de más, acá no sobrevivía nada.
 */
type Action = (input: AddBookingChargeInput) => Promise<BookingChargeActionResult>

function renderCharges(addBookingChargeAction: Action) {
  render(
    <BookingCharges
      bookingId="11111111-1111-4111-8111-111111111111"
      priceSnapshot={10_000_00}
      depositAmount={0}
      depositStatus="not_required"
      charges={[]}
      chargesTotal={0}
      addBookingChargeAction={addBookingChargeAction}
    />,
  )
}

const OK = { success: true, cashFlow: {} } as unknown as BookingChargeActionResult

afterEach(() => {
  cleanup()
  refresh.mockClear()
})

describe('BookingCharges: un corte de red no convierte el reintento en otro cobro', () => {
  it('después de un corte, el reintento reenvía el mismo cobro con la MISMA key y no deja cargar otro', async () => {
    const action = vi
      .fn<Action>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(OK)
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))

    const retry = await screen.findByRole('button', { name: /^Reintentar cobro de/ })
    expect(screen.getByText(/no sabemos si ese cobro entró/i)).toBeInTheDocument()
    // No se puede cambiar el monto, el método ni sumar líneas: lo único que sale
    // es ESE cobro. (Antes se medía con la pestaña "Pago único", que se fue
    // cuando el detalle pasó al control de cobro compartido.)
    expect(screen.getByLabelText('Monto')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Método de pago' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Agregar pago dividido/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Registrar cobro' })).toBeNull()

    fireEvent.click(retry)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const [first, second] = action.mock.calls.map((c) => c[0])
    expect(second!.charges).toEqual(first!.charges)
    expect(second!.clientIdempotencyKey).toBeTruthy()
    expect(second!.clientIdempotencyKey).toBe(first!.clientIdempotencyKey)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('cerrar y volver a abrir el formulario no esquiva el reintento pendiente', async () => {
    const action = vi.fn<Action>().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))
    await screen.findByRole('button', { name: /^Reintentar cobro de/ })

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))

    expect(screen.getByRole('button', { name: /^Reintentar cobro de/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar cobro' })).toBeNull()
  })

  it('cada cobro resuelto (bien o rechazado por el servidor) deja al siguiente con OTRA key', async () => {
    const action = vi
      .fn<Action>()
      .mockResolvedValueOnce({ success: false, error: 'Demasiadas solicitudes.' })
      .mockResolvedValue(OK)
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))
    await screen.findByText('Demasiadas solicitudes.')

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar cobro' }))

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const [first, second] = action.mock.calls.map((c) => c[0])
    expect(second!.clientIdempotencyKey).toBeTruthy()
    expect(second!.clientIdempotencyKey).not.toBe(first!.clientIdempotencyKey)
  })
})
