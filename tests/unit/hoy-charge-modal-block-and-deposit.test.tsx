// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

import { toast } from '@/hooks/use-toast'
import { HoyChargeModal } from '@/app/(admin)/dashboard/_components/HoyChargeModal'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import { bookingBlock, bookingPendingPayment, toGridBooking } from '@/test/fixtures/booking'
import { formatArs } from '@/lib/format'

const COURTS = [
  {
    id: 'court-1',
    name: 'Cancha 1',
    status: 'online' as const,
    capacity: 10,
    pricing: { rules: [] } as never,
  },
]

function makeActions(overrides: Partial<SlotPanelActions> = {}): SlotPanelActions {
  return {
    chargeDebtAction: vi.fn(async () => ({ success: true as const })),
    completeAndChargeBookingAction: vi.fn(async () => ({ success: true as const })),
    addBookingChargeAction: vi.fn(async () => ({ success: true as const })),
    markNoShowAction: vi.fn(async () => ({ success: true as const })),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.mocked(toast).mockClear()
})

describe('HoyChargeModal — bloqueo', () => {
  it('muestra "Liberar el bloqueo" y no muestra cobro', async () => {
    const releaseBlockAction = vi.fn(async () => ({ success: true as const }))
    const b = { ...toGridBooking(bookingBlock()), courtId: 'court-1' }
    render(
      <HoyChargeModal
        booking={b}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={makeActions({ releaseBlockAction })}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Liberar el bloqueo' })).toBeVisible()
    expect(screen.queryByText('Falta cobrar')).toBeNull()
    expect(screen.queryByText('Cobrado ✓')).toBeNull()
  })

  it('confirmar libera el bloqueo, avisa por toast y refresca', async () => {
    const releaseBlockAction = vi.fn(async () => ({ success: true as const }))
    const onMutated = vi.fn()
    const b = { ...toGridBooking(bookingBlock()), courtId: 'court-1' }
    render(
      <HoyChargeModal
        booking={b}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={onMutated}
        hasEnded={false}
        actions={makeActions({ releaseBlockAction })}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Liberar el bloqueo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Liberar el bloqueo' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Liberar' }))

    await waitFor(() => expect(releaseBlockAction).toHaveBeenCalledWith(b.id))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Bloqueo liberado', variant: 'success' }),
      ),
    )
    expect(onMutated).toHaveBeenCalled()
  })
})

describe('HoyChargeModal — "Cobrar seña $X"', () => {
  it('con pending_payment y seña, muestra "Cobrar seña $X"', async () => {
    const confirmDepositPaymentAction = vi.fn(async () => ({ success: true as const }))
    const row = bookingPendingPayment()
    const b = {
      ...toGridBooking(row),
      courtId: 'court-1',
      pending: row.priceSnapshot,
      totalPaid: 0,
    }
    render(
      <HoyChargeModal
        booking={b}
        courtName="Cancha 1"
        courts={COURTS}
        dayBookings={[]}
        daySlots={[]}
        nowMs={Date.now()}
        isRefreshing={false}
        onClose={vi.fn()}
        onMutated={vi.fn()}
        hasEnded={false}
        actions={makeActions({ confirmDepositPaymentAction })}
      />,
    )

    expect(
      await screen.findByRole('button', { name: `Cobrar seña ${formatArs(b.depositAmount!)}` }),
    ).toBeVisible()
  })

  it('sin confirmDepositPaymentAction, no ofrece el botón', () => {
    const row = bookingPendingPayment()
    const b = {
      ...toGridBooking(row),
      courtId: 'court-1',
      pending: row.priceSnapshot,
      totalPaid: 0,
    }
    render(
      <HoyChargeModal
        booking={b}
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

    expect(screen.queryByRole('button', { name: /^Cobrar seña/ })).toBeNull()
  })
})
