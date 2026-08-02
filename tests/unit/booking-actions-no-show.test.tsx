// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const toastMock = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

import BookingActions from '@/app/(admin)/reservas/[id]/BookingActions'

const markNoShowMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
const revertNoShowMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
const cancelBookingMock = vi.fn(async () => ({ success: true as const, booking: {} as never }))
const completeAndChargeMock = vi.fn(async () => ({ success: true as const }) as never)

function renderConfirmed() {
  return render(
    <BookingActions
      bookingId="b1"
      status="confirmed"
      depositStatus="not_required"
      depositAmount={0}
      paymentMethod={null}
      priceSnapshot={1_500_000}
      chargesTotal={0}
      guestName="Juan"
      guestPhone={null}
      bookingDate="2026-08-10"
      timeStart="14:00:00"
      cancellationPolicyHours={24}
      completeAndChargeBookingAction={completeAndChargeMock}
      markNoShowAction={markNoShowMock}
      revertNoShowAction={revertNoShowMock}
      cancelBookingAction={cancelBookingMock}
    />,
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('BookingActions (detalle) — Marcar ausente', () => {
  it('abre ConfirmDialog con las consecuencias — misma gramática que QuickActions (lista)', async () => {
    renderConfirmed()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar ausente' }))
    expect(markNoShowMock).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('La seña pagada queda para el complejo.')).toBeTruthy()
    expect(within(dialog).getByText(/queda bloqueado 14 días/)).toBeTruthy()
    expect(within(dialog).getByText('No se puede deshacer pasadas 24hs.')).toBeTruthy()
  })

  it('al confirmar, ejecuta la action y el toast ofrece Deshacer', async () => {
    renderConfirmed()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar ausente' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar ausente' }))

    await waitFor(() => expect(markNoShowMock).toHaveBeenCalledWith('b1'))
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Marcada como ausente',
          action: expect.objectContaining({ label: 'Deshacer' }),
        }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('clickear "Deshacer" en el toast llama revertNoShowAction', async () => {
    renderConfirmed()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar ausente' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar ausente' }))

    await waitFor(() => expect(toastMock).toHaveBeenCalled())
    const call = toastMock.mock.calls.find((c) => c[0]?.title === 'Marcada como ausente')
    await act(async () => {
      call?.[0]?.action?.onClick()
    })
    await waitFor(() => expect(revertNoShowMock).toHaveBeenCalledWith('b1'))
  })
})
