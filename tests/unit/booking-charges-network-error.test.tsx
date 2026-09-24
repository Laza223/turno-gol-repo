// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import BookingCharges from '@/app/(admin)/reservas/[id]/BookingCharges'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import type { GridBooking } from '@/lib/booking/grid-cells'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * Detalle de reserva (/reservas/[id]). Armaba una clientIdempotencyKey NUEVA en
 * cada toque de "Registrar cobro": si la request se cortaba por la red pero el
 * cobro entraba, el reintento viajaba con otra key y el servidor lo insertaba
 * de nuevo. Mismo problema de fondo que el panel de la grilla (PR #328).
 *
 * Desde 2026-09-24 este componente arma el cobro con el control compartido
 * (`HoyChargeSection` + `useSlotCharges`, el mismo de Hoy y la Grilla): la
 * idempotencia vive en el hook, y este archivo cubre que BookingCharges la
 * enchufe bien (el escenario de red en sí ya lo cubre `HoyChargeModal.stories`).
 */
type ChargeAction = SlotPanelActions['addBookingChargeAction']

/** Turno confirmado sin terminar (sin `endsAtMs`): `chargeMode` da 'advance'. */
const BOOKING: GridBooking = {
  id: '11111111-1111-4111-8111-111111111111',
  courtId: '22222222-2222-4222-8222-222222222222',
  date: '2026-03-14',
  timeStart: '19:00',
  timeEnd: '20:00',
  status: 'confirmed',
  type: 'spontaneous',
  guestName: 'Juan Pérez',
  playerFirstName: null,
  playerLastName: null,
  priceSnapshot: 10_000_00,
  depositStatus: 'not_required',
  depositAmount: 0,
  totalPaid: 0,
  pending: 10_000_00,
}

function renderCharges(addBookingChargeAction: ChargeAction) {
  render(
    <BookingCharges
      booking={BOOKING}
      charges={[]}
      chargesTotal={0}
      actions={{
        addBookingChargeAction,
        completeAndChargeBookingAction: vi.fn(),
        chargeDebtAction: vi.fn(),
        markNoShowAction: vi.fn(),
      }}
    />,
  )
}

const OK: ActionResult = { success: true }

afterEach(() => {
  cleanup()
  refresh.mockClear()
})

describe('BookingCharges: un corte de red no convierte el reintento en otro cobro', () => {
  it('después de un corte, el reintento reenvía el mismo cobro con la MISMA key y no deja cargar otro', async () => {
    const action = vi
      .fn<ChargeAction>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(OK)
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }))

    const retry = await screen.findByRole('button', { name: /^Reintentar cobro de/ })
    expect(screen.getByText(/no sabemos si ese cobro entró/i)).toBeInTheDocument()
    // No se puede cambiar el monto, el método ni sumar líneas: lo único que sale
    // es ESE cobro.
    expect(screen.getByLabelText('Monto')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Método de pago' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Agregar pago dividido/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).toBeNull()

    // Mismo contrato que el caso de abajo: un toque sobre un botón todavía
    // deshabilitado se pierde y el reintento no sale.
    expect(retry).toBeEnabled()
    fireEvent.click(retry)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const [first, second] = action.mock.calls.map((c) => c[0])
    expect(second!.charges).toEqual(first!.charges)
    expect(second!.clientIdempotencyKey).toBeTruthy()
    expect(second!.clientIdempotencyKey).toBe(first!.clientIdempotencyKey)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('cerrar y volver a abrir el formulario no esquiva el reintento pendiente', async () => {
    const action = vi.fn<ChargeAction>().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }))
    await screen.findByRole('button', { name: /^Reintentar cobro de/ })

    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    expect(cancel).toBeEnabled()
    fireEvent.click(cancel)
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))

    expect(screen.getByRole('button', { name: /^Reintentar cobro de/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cobrar/ })).toBeNull()
  })

  it('cada cobro resuelto (bien o rechazado por el servidor) deja al siguiente con OTRA key', async () => {
    const action = vi
      .fn<ChargeAction>()
      .mockResolvedValueOnce({ success: false, error: 'Demasiadas solicitudes.' })
      .mockResolvedValue(OK)
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }))
    await screen.findByText('Demasiadas solicitudes.')

    const registrar = screen.getByRole('button', { name: /^Cobrar/ })
    expect(registrar).toBeEnabled()
    fireEvent.click(registrar)

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const [first, second] = action.mock.calls.map((c) => c[0])
    expect(second!.clientIdempotencyKey).toBeTruthy()
    expect(second!.clientIdempotencyKey).not.toBe(first!.clientIdempotencyKey)
  })

  it('un cobro que se resuelve bien también rota la key del próximo (el form se cierra solo)', async () => {
    const action = vi.fn<ChargeAction>().mockResolvedValue(OK)
    renderCharges(action)

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }))

    // El form se cierra solo tras el éxito: vuelve a aparecer el botón de abrirlo.
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await screen.findByRole('button', { name: '+ Agregar cobro' })

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar cobro' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2))
    const [first, second] = action.mock.calls.map((c) => c[0])
    expect(second!.clientIdempotencyKey).toBeTruthy()
    expect(second!.clientIdempotencyKey).not.toBe(first!.clientIdempotencyKey)
  })
})
