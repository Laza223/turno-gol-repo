import { beforeEach, describe, expect, it, vi } from 'vitest'

// Revisión roja: `editBooking` lockea la cancha con `lockCourtOrThrow`, que
// tira `CourtOfflineError` si quedó `offline` (mismo patrón que
// createManualBooking/rescheduleBooking). `editBookingAction` no tenía una
// rama para ese error en su catch — se colaba como 500 en vez de un mensaje
// de dominio, a diferencia de create/reschedule que sí lo atrapan.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(),
  requireAdminStaffAction: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/modules/bookings/booking.edit', () => ({ editBooking: vi.fn() }))
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

import { editBookingAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { editBooking } from '@/modules/bookings/booking.edit'
import { CourtOfflineError } from '@/modules/bookings/booking.errors'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const COURT_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (t: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
})

describe('editBookingAction', () => {
  it('mapea CourtOfflineError a un mensaje de dominio en vez de re-lanzarlo', async () => {
    vi.mocked(editBooking).mockRejectedValue(new CourtOfflineError(COURT_ID))

    const res = await editBookingAction({ bookingId: BOOKING_ID, guestName: 'Juan Gómez' })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toBe('La cancha no está disponible.')
    }
  })

  // 🟡 Hallazgo 7 (auditoría 2026-09-16): el schema normaliza el '' que manda
  // el diálogo al borrar el teléfono en `null` — distinto de omitirlo, que
  // deja el valor viejo intacto. `editBooking` tiene que recibir esa señal.
  it('normaliza guestPhone: "" a null antes de llamar a editBooking (borrar el teléfono)', async () => {
    vi.mocked(editBooking).mockResolvedValue({ id: BOOKING_ID } as never)

    await editBookingAction({ bookingId: BOOKING_ID, guestName: 'Juan Pérez', guestPhone: '' })

    expect(editBooking).toHaveBeenCalledWith(
      'tenant-1',
      'staff-1',
      expect.objectContaining({ guestPhone: null }),
      expect.anything(),
    )
  })

  it('un guestPhone ausente no se manda a editBooking (no lo tocó)', async () => {
    vi.mocked(editBooking).mockResolvedValue({ id: BOOKING_ID } as never)

    await editBookingAction({ bookingId: BOOKING_ID, guestName: 'Juan Pérez' })

    const [, , input] = vi.mocked(editBooking).mock.calls[0]!
    expect(Object.prototype.hasOwnProperty.call(input, 'guestPhone')).toBe(false)
  })
})
