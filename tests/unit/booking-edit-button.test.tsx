// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { BookingSlotPanel, type SlotPanelActions } from '@/components/booking/BookingSlotPanel'
import { booking, bookingBlock, bookingCompleted, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * D2 (2026-09-15): "Editar" tiene que estar visible A LA VISTA (no detrás de
 * "Más") exactamente cuando `editBooking` lo va a aceptar — mismo criterio que
 * el resto de los botones del panel (canReschedule, canCancel, …): un botón
 * que el backend siempre rechazaría es peor que no tener el botón.
 */
function makeActions(overrides: Partial<SlotPanelActions> = {}): SlotPanelActions {
  return {
    chargeDebtAction: vi.fn(async () => ({ success: true as const })),
    completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
    addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
    markNoShowAction: vi.fn(async () => ({ success: true as const })),
    editBookingAction: vi.fn(async () => ({ success: true as const })),
    getBookingEditDetailAction: vi.fn(async () => ({
      success: true as const,
      guestPhone: null,
      createdByStaff: null,
    })),
    ...overrides,
  }
}

const COURTS = [{ id: 'court-1', name: 'Cancha 1' }]

afterEach(cleanup)

describe('BookingSlotPanel — botón "Editar" (D2)', () => {
  it('confirmado y no bloqueo/torneo: "Editar" está a la vista, no detrás de "Más"', () => {
    render(
      <BookingSlotPanel
        booking={{ ...toGridBooking(booking(), player()), pending: 0, totalPaid: 1500000 }}
        courtName="Cancha 1"
        onClose={vi.fn()}
        hasEnded={false}
        courts={COURTS}
        actions={makeActions()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
  })

  it('sin editBookingAction: no ofrece "Editar"', () => {
    const actions = makeActions()
    delete (actions as { editBookingAction?: unknown }).editBookingAction

    render(
      <BookingSlotPanel
        booking={{ ...toGridBooking(booking(), player()), pending: 0, totalPaid: 1500000 }}
        courtName="Cancha 1"
        onClose={vi.fn()}
        hasEnded={false}
        courts={COURTS}
        actions={actions}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('turno terminal (completed): no ofrece "Editar"', () => {
    render(
      <BookingSlotPanel
        booking={{ ...toGridBooking(bookingCompleted()), pending: 0, totalPaid: 1800000 }}
        courtName="Cancha 1"
        onClose={vi.fn()}
        hasEnded
        courts={COURTS}
        actions={makeActions()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('bloqueo de mantenimiento: no ofrece "Editar"', () => {
    render(
      <BookingSlotPanel
        booking={{ ...toGridBooking(bookingBlock()), pending: 0, totalPaid: 0 }}
        courtName="Cancha 1"
        onClose={vi.fn()}
        hasEnded={false}
        courts={COURTS}
        actions={makeActions()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })
})
