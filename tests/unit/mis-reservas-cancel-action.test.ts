import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BookingNotOwnedByPlayerError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'player', playerId: 'player-1' })),
}))
vi.mock('@/shared/rate-limit', () => ({ enforce: vi.fn(async () => ({ ok: true })) }))
// withPlayerContext devuelve el pre-read (tenant_id + deposit_status no-paid para
// saltear el path de gateway MP); withTenantContext corre el callback con tx dummy.
vi.mock('@/shared/db/client', () => ({
  withPlayerContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) =>
    cb({ execute: async () => [{ tenant_id: 'tenant-1', deposit_status: 'pending' }] }),
  ),
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
  getDb: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))
vi.mock('@/modules/bookings/booking.cancellation', () => ({ cancelByPlayer: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { cancelMyBookingAction } from '@/app/(player)/mis-reservas/actions'

const VALID_UUID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('cancelMyBookingAction — TenantInactiveError (#31)', () => {
  it('devuelve un error amigable cuando el complejo esta inactivo', async () => {
    vi.mocked(cancelByPlayer).mockRejectedValueOnce(
      new TenantInactiveError('tenant-1', 'blocked'),
    )
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result).toEqual({
      success: false,
      error: 'El complejo no está disponible para cancelar online.',
    })
  })

  it('sigue mapeando BookingNotOwnedByPlayerError (no regresiona)', async () => {
    vi.mocked(cancelByPlayer).mockRejectedValueOnce(
      new BookingNotOwnedByPlayerError(VALID_UUID, 'player-1'),
    )
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result).toEqual({
      success: false,
      error: 'No tenés permiso para cancelar esta reserva.',
    })
  })

  it('devuelve success con la reserva cancelada en el happy path', async () => {
    const booking = { id: 'booking-1', status: 'canceled_refunded' }
    vi.mocked(cancelByPlayer).mockResolvedValueOnce(booking as never)
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result).toEqual({ success: true, booking })
  })
})
