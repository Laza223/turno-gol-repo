import { beforeEach, describe, expect, it, vi } from 'vitest'

// Freemium v2 (docs/decisions/2026-11-15-freemium-corte-v2.md): el server de
// `createBookingAction` guarda el turno del gratis en $0 aunque el cliente no lo
// mande. Sin esto, el turno toma la tarifa y al pasar al plan aparece como deuda
// vieja en Caja/Cuentas.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({ getImpersonationSession: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/modules/bookings/booking.service', () => ({ createManualBooking: vi.fn() }))

import { createBookingAction } from '@/app/(admin)/reservas/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getImpersonationSession } from '@/modules/auth/impersonation.server'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createManualBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import {
  FREE_PLAN_BOOKING_ERROR,
  FREE_PLAN_DURATION_ERROR,
} from '@/modules/bookings/free-plan-block'

const STAFF_USER = {
  type: 'staff',
  staffUserId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
}
const COURT_ID = '11111111-1111-4111-8111-111111111111'
const TURNO = {
  courtId: COURT_ID,
  date: '2027-03-15',
  timeStart: '20:00',
  timeEnd: '21:00',
  type: 'spontaneous',
  guestName: 'Juan',
  guestPhone: '1122334455',
}

function asTenant(status: string) {
  vi.mocked(getStaffTenant).mockResolvedValue({ id: 'tenant-1', status, settings: {} } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getImpersonationSession).mockResolvedValue(null)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
  // Corta después de ver qué le llegó al service: el resto de la action no importa acá.
  vi.mocked(createManualBooking).mockRejectedValue(new SlotTakenError())
})

describe('createBookingAction en el plan gratis', () => {
  it('guarda el turno con nombre en $0 aunque el cliente no mande precio', async () => {
    asTenant('free')
    await createBookingAction(TURNO)
    expect(vi.mocked(createManualBooking)).toHaveBeenCalledTimes(1)
    const input = vi.mocked(createManualBooking).mock.calls[0]![1]
    expect(input).toMatchObject({ guestName: 'Juan', guestPhone: '1122334455', priceOverride: 0 })
  })

  it('en el plan pago no toca el precio', async () => {
    asTenant('active')
    await createBookingAction(TURNO)
    const input = vi.mocked(createManualBooking).mock.calls[0]![1]
    expect(input).not.toHaveProperty('priceOverride')
  })

  it('rechaza un precio antes de llegar al service', async () => {
    asTenant('free')
    const res = await createBookingAction({ ...TURNO, priceOverride: 2_500_000 })
    expect(res).toEqual({ success: false, error: FREE_PLAN_BOOKING_ERROR })
    expect(vi.mocked(createManualBooking)).not.toHaveBeenCalled()
  })

  it('rechaza un evento de varias horas', async () => {
    asTenant('free')
    const res = await createBookingAction({ ...TURNO, timeEnd: '23:00' })
    expect(res).toEqual({ success: false, error: FREE_PLAN_DURATION_ERROR })
    expect(vi.mocked(createManualBooking)).not.toHaveBeenCalled()
  })
})
