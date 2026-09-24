// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { toast } from '@/hooks/use-toast'
import { HoyChargeModal } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { booking, bookingNoShow, toGridBooking } from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'

/**
 * "Deshacer la ausencia" sólo existe con el turno en `no_show`, y en ese
 * estado el modal no monta la sección de cobro — que era el único lugar que
 * pintaba el `error` del hook. Si la action fallaba, el aviso se perdía y el
 * botón no hacía nada visible.
 *
 * Mudado de BookingSlotPanel.tsx a HoyChargeModal (paso 3, docs/decisions/
 * 2026-09-24-navegacion-panel.md): el panel de la Grilla se borró.
 */
const COURTS = [
  {
    id: 'court-1',
    name: 'Cancha 1',
    status: 'online' as const,
    capacity: 10,
    pricing: { rules: [] } as never,
  },
]

afterEach(() => {
  cleanup()
  vi.mocked(toast).mockClear()
})

describe('modal de cobro: deshacer la ausencia', () => {
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
      <HoyChargeModal
        booking={b}
        courtName="Cancha 1"
        courts={[{ ...COURTS[0]!, id: b.courtId }]}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded
        actions={actions}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer la ausencia' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('X')
    expect(revertNoShowAction).toHaveBeenCalledWith(b.id)
  })

  it('un ausente no muestra "Cobrado ✓" (no es deuda, pero tampoco está "cobrado")', async () => {
    const b = toGridBooking(bookingNoShow(), player())
    render(
      <HoyChargeModal
        booking={b}
        courtName="Cancha 1"
        courts={[{ ...COURTS[0]!, id: b.courtId }]}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded
        actions={{
          chargeDebtAction: vi.fn(async () => ({ success: true as const })),
          completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
          addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
          markNoShowAction: vi.fn(async () => ({ success: true as const })),
        }}
      />,
    )

    await screen.findByText('Cancha 1', { exact: false })
    expect(screen.queryByText('Cobrado ✓')).toBeNull()
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
      <HoyChargeModal
        booking={b}
        courtName="Cancha 1"
        courts={[{ ...COURTS[0]!, id: b.courtId }]}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded
        actions={actions}
      />,
    )

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
