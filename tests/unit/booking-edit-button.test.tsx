// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { HoyChargeModal } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { HoyCourt } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { booking, bookingBlock, bookingCompleted, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * D2 (2026-09-15): "Editar" solo se ofrece (en el menú "Más acciones del
 * turno") exactamente cuando `editBooking` lo va a aceptar — mismo criterio
 * que el resto de los botones del modal (canReschedule, canCancel, …): un
 * botón que el backend siempre rechazaría es peor que no tener el botón.
 *
 * Mudado de BookingSlotPanel.tsx a HoyChargeModal (paso 3, docs/decisions/
 * 2026-09-24-navegacion-panel.md): el panel de la Grilla se borró, y con él
 * el "Editar" fuera del menú — en el modal, Editar/Reprogramar/Cancelar
 * siempre viven detrás de ⋯.
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

const COURTS: HoyCourt[] = [
  {
    id: 'court-1',
    name: 'Cancha 1',
    status: 'online',
    capacity: 10,
    pricing: { rules: [] } as unknown as HoyCourt['pricing'],
  },
]

afterEach(cleanup)

describe('HoyChargeModal — "Editar" en el menú "Más acciones del turno" (D2)', () => {
  it('confirmado y no bloqueo/torneo: el menú ofrece "Editar"', async () => {
    render(
      <HoyChargeModal
        booking={{ ...toGridBooking(booking(), player()), pending: 0, totalPaid: 1500000 }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={makeActions()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Más acciones del turno' })
    // Radix abre con pointerdown + click (mismo patrón que staff-actions.test.tsx).
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
  })

  it('sin editBookingAction ni otra acción del menú: no ofrece el menú "Más acciones"', () => {
    const actions = makeActions()
    delete (actions as { editBookingAction?: unknown }).editBookingAction

    render(
      <HoyChargeModal
        booking={{ ...toGridBooking(booking(), player()), pending: 0, totalPaid: 1500000 }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={actions}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Más acciones del turno' })).toBeNull()
  })

  it('turno terminal (completed): no ofrece el menú "Más acciones"', () => {
    render(
      <HoyChargeModal
        booking={{ ...toGridBooking(bookingCompleted()), pending: 0, totalPaid: 1800000 }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded
        actions={makeActions()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Más acciones del turno' })).toBeNull()
  })

  it('bloqueo de mantenimiento: no ofrece el menú "Más acciones"', () => {
    render(
      <HoyChargeModal
        booking={{ ...toGridBooking(bookingBlock()), pending: 0, totalPaid: 0 }}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={makeActions()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Más acciones del turno' })).toBeNull()
  })
})
