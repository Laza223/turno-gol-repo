import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tarea #8 — addBookingChargeAction: validación + guard de estado cobrable,
// sin DB. El path transaccional real (createCashFlow + getBookingCharges) se
// cubre en tests/integration/booking-charges.test.ts.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(),
  requireAdminStaffAction: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/modules/bookings/booking.service', () => ({
  createManualBooking: vi.fn(),
  completeBooking: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByAdmin: vi.fn(),
  handleNoShow: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))

import { addBookingChargeAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'

// withTenantContext mockeado: corre el callback con un tx cuyo execute() devuelve
// el status configurado para el SELECT del guard.
function mockTxWithStatus(rows: Array<{ status: string }>) {
  const tx = { execute: vi.fn().mockResolvedValue(rows) }
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (t: never) => Promise<unknown>) => cb(tx as never)) as never,
  )
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
})

describe('addBookingChargeAction', () => {
  it('rechaza monto 0 o negativo sin tocar la caja', async () => {
    const res = await addBookingChargeAction({ bookingId: BOOKING_ID, amount: 0, method: 'cash' })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva en estado no cobrable (cancelada)', async () => {
    mockTxWithStatus([{ status: 'canceled_no_refund' }])
    const res = await addBookingChargeAction({ bookingId: BOOKING_ID, amount: 20_000_00, method: 'cash' })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('rechaza una reserva inexistente', async () => {
    mockTxWithStatus([])
    const res = await addBookingChargeAction({ bookingId: BOOKING_ID, amount: 20_000_00, method: 'cash' })
    expect(res.success).toBe(false)
    expect(vi.mocked(createCashFlow)).not.toHaveBeenCalled()
  })

  it('reserva confirmada: crea un cashflow income/booking vinculado al booking', async () => {
    mockTxWithStatus([{ status: 'confirmed' }])
    vi.mocked(createCashFlow).mockResolvedValue({ id: 'cf-1' } as never)

    const res = await addBookingChargeAction({
      bookingId: BOOKING_ID,
      amount: 38_500_00,
      method: 'transfer',
    })

    expect(res.success).toBe(true)
    expect(vi.mocked(createCashFlow)).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({
        type: 'income',
        category: 'booking',
        amount: 38_500_00,
        method: 'transfer',
        bookingId: BOOKING_ID,
      }),
      expect.anything(),
    )
  })
})
