import { beforeEach, describe, expect, it, vi } from 'vitest'

// RI #1 (doc6 §3, decisión del dueño 2026-07-24) — revertNoShowAction:
// guard de rol, mapeo de errores de negocio y, sobre todo, que el catch quede
// FUERA del contexto transaccional (regla de la clase tx-commit-a-medias,
// caja/actions.ts:107). El camino transaccional real (transición + reversión
// del strike + softban) se cubre en tests/integration/no-show-revert.test.ts.

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
  getAvailableSlots: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.concurrency', () => ({
  transitionFromPendingPayment: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByAdmin: vi.fn(),
  handleNoShow: vi.fn(),
  handleNoShowRevert: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))

import { revertNoShowAction } from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { handleNoShowRevert } from '@/modules/bookings/booking.cancellation'
import {
  BookingNotInNoShowError,
  NoShowRevertWindowExpiredError,
} from '@/modules/bookings/booking.errors'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const FAKE_TX = {} as never

/**
 * withTenantContext mockeado que además REGISTRA si el callback rechazó. Si la
 * action atrapara el error adentro del contexto y devolviera `{success:false}`,
 * el callback resolvería y `rejected` quedaría en false: la tx commitearía la
 * transición a `completed` con el strike sin revertir.
 */
let cbRejected = false
function mockContext() {
  cbRejected = false
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => {
    try {
      return await cb(FAKE_TX)
    } catch (err) {
      cbRejected = true
      throw err
    }
  }) as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: 'staff-1' },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  mockContext()
})

describe('revertNoShowAction', () => {
  it('staff sin membresía activa: no toca la reserva', async () => {
    vi.mocked(requireOperatorStaff).mockResolvedValue({
      ok: false,
      error: 'Sin permisos',
    } as never)

    const res = await revertNoShowAction(BOOKING_ID)

    expect(res.success).toBe(false)
    expect(vi.mocked(handleNoShowRevert)).not.toHaveBeenCalled()
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('rate limit del complejo alcanzado: corta antes de abrir la tx', async () => {
    vi.mocked(adminRateLimited).mockResolvedValue('Demasiadas acciones seguidas.' as never)

    const res = await revertNoShowAction(BOOKING_ID)

    expect(res.success).toBe(false)
    expect(vi.mocked(handleNoShowRevert)).not.toHaveBeenCalled()
    expect(vi.mocked(withTenantContext)).not.toHaveBeenCalled()
  })

  it('camino feliz: delega en handleNoShowRevert con el staff de la sesión', async () => {
    vi.mocked(handleNoShowRevert).mockResolvedValue({
      id: BOOKING_ID,
      status: 'completed',
    } as never)

    const res = await revertNoShowAction(BOOKING_ID)

    expect(res.success).toBe(true)
    expect(vi.mocked(handleNoShowRevert)).toHaveBeenCalledWith(BOOKING_ID, 'staff-1', FAKE_TX)
  })

  it('reserva que ya no está en no_show: mensaje de negocio, sin filtrar el error crudo', async () => {
    vi.mocked(handleNoShowRevert).mockRejectedValue(new BookingNotInNoShowError(BOOKING_ID))

    const res = await revertNoShowAction(BOOKING_ID)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('La reserva no está marcada como ausente.')
  })

  it('fuera de la ventana de 24h: avisa que ya no se puede deshacer', async () => {
    vi.mocked(handleNoShowRevert).mockRejectedValue(new NoShowRevertWindowExpiredError(BOOKING_ID))

    const res = await revertNoShowAction(BOOKING_ID)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/24hs/i)
  })

  // Regla de la clase tx-commit-a-medias: el catch NO puede estar adentro de
  // withTenantContext. Si lo estuviera, el rollback nunca ocurriría.
  it('el error de negocio atraviesa el contexto transaccional (rollback), no se atrapa adentro', async () => {
    vi.mocked(handleNoShowRevert).mockRejectedValue(new BookingNotInNoShowError(BOOKING_ID))

    const res = await revertNoShowAction(BOOKING_ID)

    expect(res.success).toBe(false)
    expect(cbRejected).toBe(true)
  })

  // Control positivo del test de arriba: sin error, el callback resuelve y el
  // flag queda en false — o sea que `cbRejected` mide lo que dice medir.
  it('control positivo: sin error el callback resuelve (cbRejected queda false)', async () => {
    vi.mocked(handleNoShowRevert).mockResolvedValue({ id: BOOKING_ID } as never)

    await revertNoShowAction(BOOKING_ID)

    expect(cbRejected).toBe(false)
  })

  // Un error inesperado (no de negocio) NO se traga: sube y lo maneja Next.
  it('un error inesperado se re-lanza en vez de devolver success:false', async () => {
    vi.mocked(handleNoShowRevert).mockRejectedValue(new Error('connection terminated'))

    await expect(revertNoShowAction(BOOKING_ID)).rejects.toThrow('connection terminated')
  })
})
