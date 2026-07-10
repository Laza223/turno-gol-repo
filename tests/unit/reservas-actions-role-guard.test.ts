import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cruce #1 (auditoría cruzada junio): ROLES × ACCIONES RÁPIDAS.
// Las 5 Server Actions de reservas deben rechazar a un staff SIN membresía
// activa (rol null) ANTES de tocar la DB o el gateway de MP. admin y manager
// (Encargado) operan con normalidad. El rol se lee de la DB vía getStaffRole —
// el claim del JWT está hardcodeado a 'admin' en extractAuthUser y NO protege.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
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

import {
  cancelBookingAction,
  completeBookingAction,
  confirmDepositPaymentAction,
  createBookingAction,
  markNoShowAction,
} from '@/app/(admin)/reservas/actions'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withTenantContext, getDb } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import {
  createManualBooking,
  completeBooking,
} from '@/modules/bookings/booking.service'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import {
  cancelByAdmin,
  handleNoShow,
} from '@/modules/bookings/booking.cancellation'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'

const STAFF_USER = { type: 'staff', staffUserId: 'staff-1', role: 'admin' }
const TENANT = { id: 'tenant-1', settings: {} }
const FAKE_TX = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(extractAuthUser).mockResolvedValue(STAFF_USER as never)
  vi.mocked(getStaffTenant).mockResolvedValue(TENANT as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (tx: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
})

describe('reservas actions — staff sin membresía activa (rol null) es rechazado (cruce #1)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue(null)
  })

  it('createBookingAction no crea reservas sin rol', async () => {
    const res = await createBookingAction({})
    expect(res.success).toBe(false)
    expect(vi.mocked(createManualBooking)).not.toHaveBeenCalled()
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('confirmDepositPaymentAction no confirma señas sin rol', async () => {
    const res = await confirmDepositPaymentAction('b-1')
    expect(res.success).toBe(false)
    expect(vi.mocked(transitionFromPendingPayment)).not.toHaveBeenCalled()
  })

  it('completeBookingAction no completa reservas sin rol', async () => {
    const res = await completeBookingAction('b-1')
    expect(res.success).toBe(false)
    expect(vi.mocked(completeBooking)).not.toHaveBeenCalled()
  })

  it('markNoShowAction no marca ausencias (deuda/ban) sin rol', async () => {
    const res = await markNoShowAction('b-1')
    expect(res.success).toBe(false)
    expect(vi.mocked(handleNoShow)).not.toHaveBeenCalled()
  })

  it('cancelBookingAction NO resuelve el gateway MP ni cancela sin rol', async () => {
    const res = await cancelBookingAction('b-1', 'lluvia torrencial', 'complejo')
    expect(res.success).toBe(false)
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
    expect(vi.mocked(resolveTenantGateway)).not.toHaveBeenCalled()
    expect(vi.mocked(cancelByAdmin)).not.toHaveBeenCalled()
  })
})

describe('reservas actions — manager (Encargado) opera con normalidad (cruce #1)', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
  })

  it('confirmDepositPaymentAction funciona para manager', async () => {
    vi.mocked(transitionFromPendingPayment).mockResolvedValue({
      won: true,
      row: { id: 'b-1' },
    } as never)
    const res = await confirmDepositPaymentAction('b-1')
    expect(res.success).toBe(true)
    expect(vi.mocked(transitionFromPendingPayment)).toHaveBeenCalledWith('b-1', 'confirmed', FAKE_TX)
  })

  it('cancelBookingAction (motivo jugador) funciona para manager y pasa el tipo a cancelByAdmin', async () => {
    // El gateway se resuelve desde tenants.mp_access_token; sin token → null.
    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ mpAccessToken: null }]) }) }) }),
    } as never)
    vi.mocked(cancelByAdmin).mockResolvedValue({ booking: { id: 'b-1' }, pendingRefund: undefined } as never)
    const res = await cancelBookingAction('b-1', 'lluvia torrencial', 'jugador')
    expect(res.success).toBe(true)
    expect(vi.mocked(cancelByAdmin)).toHaveBeenCalledWith(
      'b-1',
      'staff-1',
      'lluvia torrencial',
      'jugador',
      null,
      FAKE_TX,
    )
  })
})
