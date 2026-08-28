import { beforeEach, describe, expect, it, vi } from 'vitest'

// Gap de audit logging (docs/spec/doc8_user_stories.md US-RES-007): "Jugó"
// (completeBookingAction) no dejaba fila en audit_logs — mismo patrón de
// mock que tests/unit/jugadores-ban-actions.test.ts.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/modules/bookings/booking.service', () => ({ completeBooking: vi.fn() }))

import { completeBookingAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { insertAuditLog } from '@/shared/db/audit'
import { completeBooking } from '@/modules/bookings/booking.service'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'

function mockTx() {
  const tx = {}
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (t: never) => Promise<unknown>,
  ) => cb(tx as never)) as never)
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

describe('completeBookingAction — audit log', () => {
  it('completa y audita booking.completed con el staff real', async () => {
    mockTx()
    vi.mocked(completeBooking).mockResolvedValue({ id: BOOKING_ID, status: 'completed' } as never)

    const res = await completeBookingAction(BOOKING_ID)

    expect(res.success).toBe(true)
    expect(vi.mocked(insertAuditLog)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'staff-1',
        actorType: 'staff',
        action: 'booking.completed',
        resourceType: 'booking',
        resourceId: BOOKING_ID,
      }),
    )
  })

  it('si completeBooking falla (ya no está confirmada) no audita nada', async () => {
    mockTx()
    vi.mocked(completeBooking).mockRejectedValue(new BookingNotInConfirmedError(BOOKING_ID))

    const res = await completeBookingAction(BOOKING_ID)

    expect(res.success).toBe(false)
    expect(vi.mocked(insertAuditLog)).not.toHaveBeenCalled()
  })

  it('rebota sin auditar si el guard rechaza (sin rol)', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'Tu rol no permite realizar esta acción.',
    } as never)

    const res = await completeBookingAction(BOOKING_ID)

    expect(res.success).toBe(false)
    expect(vi.mocked(completeBooking)).not.toHaveBeenCalled()
    expect(vi.mocked(insertAuditLog)).not.toHaveBeenCalled()
  })
})
