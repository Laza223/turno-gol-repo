// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { BookingSlotPanel, type SlotPanelActions } from '@/components/booking/BookingSlotPanel'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * R3 de la revisión del PR #326 (docs/audit/2026-09-16-revision-tanda-319-324.md).
 *
 * El panel usa una sola clientIdempotencyKey y sólo la rota cuando un cobro sale
 * bien. Si un cobro se corta por la red pero ENTRÓ, el siguiente cobro con el
 * mismo monto y método —el segundo "Pagó uno", o el Equipo 2— viajaba con esa
 * key y el servidor lo tomaba como reintento del primero: aviso verde y plata
 * que no entra. El servidor no puede distinguirlo, así que la duda se resuelve
 * acá: después de un corte, lo único que se puede mandar es ESE mismo cobro.
 */
function makeActions(overrides: Partial<SlotPanelActions> = {}): SlotPanelActions {
  return {
    chargeDebtAction: vi.fn(async () => ({ success: true as const })),
    completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
    addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
    markNoShowAction: vi.fn(async () => ({ success: true as const })),
    ...overrides,
  }
}

function renderPanel(actions: SlotPanelActions, onMutated = vi.fn()) {
  const b = {
    ...toGridBooking(booking(), player()),
    priceSnapshot: 2_400_000,
    totalPaid: 0,
    pending: 2_400_000,
  }
  render(
    <BookingSlotPanel
      booking={b}
      courtName="Cancha 1"
      onClose={vi.fn()}
      onMutated={onMutated}
      hasEnded={false}
      courts={[{ id: b.courtId, name: 'Cancha 1', capacity: 10 }]}
      actions={actions}
    />,
  )
  return { onMutated }
}

type ChargeCall = { charges: unknown; clientIdempotencyKey?: string }

afterEach(cleanup)

describe('panel de cobro: un corte de red no deja que otro cobro herede la key', () => {
  it('después de un corte, "Pagó uno" no manda un segundo cobro: sólo se puede reintentar ESE, con la misma key', async () => {
    const addBookingChargeAction = vi
      .fn<SlotPanelActions['addBookingChargeAction']>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true } as never)
    const { onMutated } = renderPanel(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Pagó uno/ }))
    const retry = await screen.findByRole('button', { name: /^Reintentar cobro de/ })

    // El jugador siguiente paga lo mismo: el atajo queda bloqueado mientras no se
    // sepa si el primero entró.
    expect(screen.getByRole('button', { name: /^Pagó uno/ })).toBeDisabled()
    expect(screen.getByText(/no sabemos si ese cobro entró/i)).toBeInTheDocument()
    expect(addBookingChargeAction).toHaveBeenCalledTimes(1)

    fireEvent.click(retry)

    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(2))
    const [first, second] = addBookingChargeAction.mock.calls.map((c) => c[0] as ChargeCall)
    expect(second!.charges).toEqual(first!.charges)
    expect(second!.clientIdempotencyKey).toBe(first!.clientIdempotencyKey)
    await waitFor(() => expect(onMutated).toHaveBeenCalled())
  })

  it('una respuesta de rechazo del servidor sí resuelve la duda: el próximo cobro viaja con OTRA key', async () => {
    const addBookingChargeAction = vi
      .fn<SlotPanelActions['addBookingChargeAction']>()
      .mockResolvedValueOnce({ success: false, error: 'Demasiadas solicitudes.' } as never)
      .mockResolvedValue({ success: true } as never)
    renderPanel(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: /^Pagó uno/ }))
    await screen.findByText('Demasiadas solicitudes.')
    expect(screen.queryByRole('button', { name: /^Reintentar cobro de/ })).toBeNull()

    // Sin esperar: el error tiene que salir en el MISMO commit en que termina la
    // transición. Si sale antes (set* suelto después del `await`), "Pagó uno"
    // todavía dice "Procesando…" y está deshabilitado: el toque se pierde.
    const pagoUno = screen.getByRole('button', { name: /^Pagó uno/ })
    expect(pagoUno).toBeEnabled()
    fireEvent.click(pagoUno)

    await waitFor(() => expect(addBookingChargeAction).toHaveBeenCalledTimes(2))
    const [first, second] = addBookingChargeAction.mock.calls.map((c) => c[0] as ChargeCall)
    expect(second!.clientIdempotencyKey).not.toBe(first!.clientIdempotencyKey)
  })

  it('en el pago por equipo, el corte del Equipo 1 bloquea el "Cobrar" del Equipo 2', async () => {
    const addBookingChargeAction = vi
      .fn<SlotPanelActions['addBookingChargeAction']>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPanel(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('button', { name: 'Dividir pago por equipo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cobrar al Equipo 1' }))

    await screen.findByRole('button', { name: /^Reintentar cobro de/ })
    expect(screen.getByRole('button', { name: 'Cobrar al Equipo 2' })).toBeDisabled()
    expect(addBookingChargeAction).toHaveBeenCalledTimes(1)
  })
})
