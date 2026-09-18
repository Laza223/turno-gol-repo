// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { toast } from '@/hooks/use-toast'
import { BookingSlotPanel, type SlotPanelActions } from '@/components/booking/BookingSlotPanel'
import { booking, bookingNoShow, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * "Deshacer la ausencia" sólo existe con el turno en `no_show`, y en ese estado
 * el panel no monta la sección de cobro — que era el único lugar que pintaba el
 * `error` del hook. Si la action fallaba, el aviso se perdía y el botón no hacía
 * nada visible.
 */
afterEach(() => {
  cleanup()
  vi.mocked(toast).mockClear()
})

describe('panel del turno: deshacer la ausencia', () => {
  it('si la action falla, el error se ve junto al botón', async () => {
    const revertNoShowAction = vi.fn(async () => ({ success: false as const, error: 'X' }))
    const actions: SlotPanelActions = {
      chargeDebtAction: vi.fn(async () => ({ success: true as const })),
      completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
      addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
      markNoShowAction: vi.fn(async () => ({ success: true as const })),
      revertNoShowAction,
    }
    const b = toGridBooking(bookingNoShow(), player())
    render(
      <BookingSlotPanel
        booking={b}
        courtName="Cancha 1"
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded
        courts={[{ id: b.courtId, name: 'Cancha 1', capacity: 10 }]}
        actions={actions}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer la ausencia' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('X')
    expect(revertNoShowAction).toHaveBeenCalledWith(b.id)
  })

  it('el "Deshacer" del aviso de ausencia también avisa si falla', async () => {
    const revertNoShowAction = vi.fn(async () => ({ success: false as const, error: 'X' }))
    const actions: SlotPanelActions = {
      chargeDebtAction: vi.fn(async () => ({ success: true as const })),
      completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
      addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
      markNoShowAction: vi.fn(async () => ({ success: true as const })),
      revertNoShowAction,
    }
    const b = toGridBooking(booking({ status: 'confirmed' }), player())
    render(
      <BookingSlotPanel
        booking={b}
        courtName="Cancha 1"
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded
        courts={[{ id: b.courtId, name: 'Cancha 1', capacity: 10 }]}
        actions={actions}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /^Más/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar ausente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Marcar como ausente' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar ausente' }))

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ausencia registrada' })),
    )
    const registered = vi
      .mocked(toast)
      .mock.calls.map((c) => c[0] as { title?: unknown; action?: { onClick: () => void } })
      .find((t) => t.title === 'Ausencia registrada')
    registered!.action!.onClick()

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'X', variant: 'destructive' }),
      ),
    )
    expect(revertNoShowAction).toHaveBeenCalledWith(b.id)
  })
})
