// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { HoyChargeModal } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { booking, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * R3 de la revisión del PR #326 (docs/audit/2026-09-16-revision-tanda-319-324.md).
 *
 * El modal usa una sola clientIdempotencyKey y sólo la rota cuando un cobro sale
 * bien. Si un cobro se corta por la red pero ENTRÓ, el siguiente cobro con el
 * mismo monto y método —el segundo "Pagó uno", o el Equipo 2— viajaba con esa
 * key y el servidor lo tomaba como reintento del primero: aviso verde y plata
 * que no entra. El servidor no puede distinguirlo, así que la duda se resuelve
 * acá: después de un corte, lo único que se puede mandar es ESE mismo cobro.
 *
 * Mudado de BookingSlotPanel.tsx a HoyChargeModal (paso 3, docs/decisions/
 * 2026-09-24-navegacion-panel.md): el panel de la Grilla se borró.
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

function renderModal(actions: SlotPanelActions, onMutated = vi.fn()) {
  const b = {
    ...toGridBooking(booking(), player()),
    priceSnapshot: 2_400_000,
    totalPaid: 0,
    pending: 2_400_000,
  }
  render(
    <HoyChargeModal
      booking={b}
      courtName="Cancha 1"
      courts={[
        {
          id: b.courtId,
          name: 'Cancha 1',
          status: 'online',
          capacity: 10,
          pricing: { rules: [] } as never,
        },
      ]}
      dayBookings={[]}
      daySlots={[]}
      nowMs={Date.now()}
      isRefreshing={false}
      onClose={vi.fn()}
      onMutated={onMutated}
      hasEnded={false}
      actions={actions}
    />,
  )
  return { onMutated }
}

type ChargeCall = { charges: unknown; clientIdempotencyKey?: string }

afterEach(cleanup)

describe('modal de cobro: un corte de red no deja que otro cobro herede la key', () => {
  it('después de un corte, "Pagó uno" no manda un segundo cobro: sólo se puede reintentar ESE, con la misma key', async () => {
    const addBookingChargeAction = vi
      .fn<SlotPanelActions['addBookingChargeAction']>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true } as never)
    const { onMutated } = renderModal(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('radio', { name: 'Por jugador' }))
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
    renderModal(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('radio', { name: 'Por jugador' }))
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
    renderModal(makeActions({ addBookingChargeAction }))

    fireEvent.click(await screen.findByRole('radio', { name: 'Por equipo' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Cobrar .* al Equipo 1$/ }))

    await screen.findByRole('button', { name: /^Reintentar cobro de/ })
    expect(screen.getByRole('button', { name: /^Cobrar .* al Equipo 2$/ })).toBeDisabled()
    expect(addBookingChargeAction).toHaveBeenCalledTimes(1)
  })
})
