import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fase 4 UX — checkSlotAvailabilityAction: chequeo optimista de disponibilidad
// al abrir BookingFormModal. Nunca es la fuente de verdad (eso lo sigue
// haciendo createManualBooking → checkOverlapOrThrow en el submit): ante
// auth/rate-limit/parseo/DB caídos, siempre debe devolver available:true
// (fail-open) para no bloquear el flujo por un fallo propio.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: vi.fn(),
  requireAdminStaffAction: vi.fn(),
}))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
// La action usa el balde propio adminAvailabilityCheck vía enforce() (no
// adminCrud vía adminRateLimited): ver policies.ts.
vi.mock('@/shared/rate-limit/apply', () => ({ enforce: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn(), getDb: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', () => ({ createCashFlow: vi.fn() }))
vi.mock('@/modules/bookings/booking.service', () => ({
  createManualBooking: vi.fn(),
  completeBooking: vi.fn(),
  getAvailableSlots: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByAdmin: vi.fn(),
  handleNoShow: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))
const captureException = vi.fn()
vi.mock('@/lib/sentry', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: vi.fn(),
}))

import { checkSlotAvailabilityAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { enforce } from '@/shared/rate-limit/apply'
import { getAvailableSlots } from '@/modules/bookings/booking.service'

const COURT_ID = '11111111-1111-4111-8111-111111111111'
const VALID_INPUT = { courtId: COURT_ID, date: '2026-07-20', timeStart: '18:00' }
const FAKE_TX = {} as never

function mockAuthedTenant() {
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(enforce).mockResolvedValue({ ok: true } as never)
  vi.mocked(withTenantContext).mockImplementation(
    (async (_id: string, cb: (t: never) => Promise<unknown>) => cb(FAKE_TX)) as never,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkSlotAvailabilityAction', () => {
  it('sin rol activo: available:true, sin tocar la DB (fail-open)', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({ ok: false, error: 'nope' } as never)
    const res = await checkSlotAvailabilityAction(VALID_INPUT)
    expect(res).toEqual({ available: true })
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
    expect(vi.mocked(getAvailableSlots)).not.toHaveBeenCalled()
  })

  it('rate-limited (balde adminAvailabilityCheck): available:true, sin tocar la DB', async () => {
    mockAuthedTenant()
    vi.mocked(enforce).mockResolvedValue({ ok: false } as never)
    const res = await checkSlotAvailabilityAction(VALID_INPUT)
    expect(res).toEqual({ available: true })
    expect(vi.mocked(enforce)).toHaveBeenCalledWith('adminAvailabilityCheck', 'tenant-1')
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('input inválido (courtId no es UUID): available:true, sin tocar la DB', async () => {
    mockAuthedTenant()
    const res = await checkSlotAvailabilityAction({ ...VALID_INPUT, courtId: 'not-a-uuid' })
    expect(res).toEqual({ available: true })
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('el slot pedido sigue libre en getAvailableSlots: available:true', async () => {
    mockAuthedTenant()
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { timeStart: '18:00', timeEnd: '19:00', price: 10000, available: true },
    ] as never)
    const res = await checkSlotAvailabilityAction(VALID_INPUT)
    expect(res).toEqual({ available: true })
    expect(vi.mocked(getAvailableSlots)).toHaveBeenCalledWith('tenant-1', COURT_ID, '2026-07-20', FAKE_TX)
  })

  it('el slot pedido ya está ocupado en getAvailableSlots: available:false', async () => {
    mockAuthedTenant()
    vi.mocked(getAvailableSlots).mockResolvedValue([
      { timeStart: '18:00', timeEnd: '19:00', price: 10000, available: false },
    ] as never)
    const res = await checkSlotAvailabilityAction(VALID_INPUT)
    expect(res).toEqual({ available: false })
  })

  it('el slot no aparece en la lista (cancha offline / fuera de horario): available:true (no es colisión)', async () => {
    mockAuthedTenant()
    vi.mocked(getAvailableSlots).mockResolvedValue([] as never)
    const res = await checkSlotAvailabilityAction(VALID_INPUT)
    expect(res).toEqual({ available: true })
  })

  it('getAvailableSlots tira: available:true (fail-open) y reporta a Sentry', async () => {
    mockAuthedTenant()
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error('db down'))
    const res = await checkSlotAvailabilityAction(VALID_INPUT)
    expect(res).toEqual({ available: true })
    expect(captureException).toHaveBeenCalledOnce()
  })
})
