import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BookingAlreadyEndedError,
  BookingNotOwnedByPlayerError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(async () => ({ type: 'player', playerId: 'player-1' })),
}))
vi.mock('@/shared/rate-limit', () => ({ enforce: vi.fn(async () => ({ ok: true })) }))
// withPlayerContext devuelve el pre-read (tenant_id + deposit_status no-paid para
// saltear el path de gateway MP, más el contacto público del complejo que se le
// ofrece al jugador para reclamar la devolución); withTenantContext corre el
// callback con tx dummy.
vi.mock('@/shared/db/client', () => ({
  withPlayerContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) =>
    cb({
      execute: async () => [
        {
          tenant_id: 'tenant-1',
          deposit_status: 'pending',
          deposit_amount: 150000,
          tenant_name: 'Complejo Norte',
          tenant_phone: '+54 9 2323 346976',
          tenant_whatsapp: null,
          tenant_email: 'contacto@complejo.test',
        },
      ],
    }),
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
    vi.mocked(cancelByPlayer).mockRejectedValueOnce(new TenantInactiveError('tenant-1', 'blocked'))
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result).toEqual({
      success: false,
      error: 'El complejo no está disponible para cancelar online.',
    })
  })

  it('07-cancelbyplayer-noshow-guard: mapea BookingAlreadyEndedError a un error amigable', async () => {
    vi.mocked(cancelByPlayer).mockRejectedValueOnce(new BookingAlreadyEndedError(VALID_UUID))
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result).toEqual({
      success: false,
      error: 'El turno ya terminó. Contactá al complejo.',
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
    const booking = {
      id: 'booking-1',
      status: 'canceled_refunded',
      date: new Date('2026-08-20'),
      timeStart: '10:00:00',
      timeEnd: '11:00:00',
      depositStatus: 'refunded',
      depositAmount: 150000,
      priceSnapshot: 500000,
      canceledReason: null,
      canceledAt: new Date('2026-08-19'),
    }
    vi.mocked(cancelByPlayer).mockResolvedValueOnce({
      booking,
      pendingRefund: undefined,
      notificationIds: [],
    } as never)
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.booking.id).toBe('booking-1')
  })

  /**
   * El jugador cancelaba y no se le decía ni cuánto le tenían que devolver ni a
   * quién escribirle — los propios mensajes de error de este archivo dicen
   * "contactá al complejo" sin dar un solo canal. La devolución la hace el
   * complejo (el reembolso automático de MercadoPago falla siempre con 403),
   * así que sin esto el jugador se queda sin forma de reclamar.
   */
  it('devuelve el contacto del complejo cuando corresponde devolución', async () => {
    vi.mocked(cancelByPlayer).mockResolvedValueOnce({
      booking: {
        id: 'booking-1',
        status: 'canceled_refunded',
        date: new Date('2026-08-20'),
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        depositStatus: 'refunded',
        depositAmount: 150000,
        priceSnapshot: 500000,
        canceledReason: null,
        canceledAt: new Date('2026-08-19'),
      },
      pendingRefund: undefined,
      notificationIds: [],
    } as never)
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.refund).toEqual({
      amountCents: 150000,
      // Sin `pendingRefund` no hubo llamada a MercadoPago: la plata la debe el
      // complejo, no está devuelta.
      state: 'pending',
      bookingCode: VALID_UUID.slice(0, 8).toUpperCase(),
      dateLabel: '20/08',
      timeLabel: '10:00',
      tenantName: 'Complejo Norte',
      tenantWhatsapp: null,
      tenantPhone: '+54 9 2323 346976',
      tenantEmail: 'contacto@complejo.test',
    })
  })

  /**
   * Control negativo: fuera de política el turno queda `canceled_no_refund` y
   * no hay nada que devolver. Prometer una devolución ahí sería peor que no
   * decir nada.
   */
  it('no promete devolución cuando la cancelación quedó fuera de política', async () => {
    vi.mocked(cancelByPlayer).mockResolvedValueOnce({
      booking: {
        id: 'booking-1',
        status: 'canceled_no_refund',
        date: new Date('2026-08-20'),
        timeStart: '10:00:00',
        timeEnd: '11:00:00',
        depositStatus: 'captured',
        depositAmount: 150000,
        priceSnapshot: 500000,
        canceledReason: null,
        canceledAt: new Date('2026-08-19'),
      },
      pendingRefund: undefined,
      notificationIds: [],
    } as never)
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.refund).toBeUndefined()
  })

  it('no filtra campos internos de staff al jugador (auditoría #08-mis-reservas-data-leak)', async () => {
    const fullBooking = {
      id: 'booking-1',
      tenantId: 'tenant-1',
      courtId: 'court-1',
      playerId: 'player-1',
      abonadoId: null,
      tournamentId: null,
      createdByStaff: 'staff-secret-id',
      date: new Date('2026-08-20'),
      timeStart: '10:00',
      timeEnd: '11:00',
      type: 'spontaneous',
      status: 'canceled_refunded',
      priceSnapshot: 500000,
      depositAmount: 150000,
      depositStatus: 'refunded',
      paymentMethod: 'mercadopago',
      paymentId: 'payment-secret-id',
      notesInternal: 'cliente conflictivo, ojo',
      notesPlayer: null,
      guestName: 'Juan Invitado',
      guestPhone: '+5491111111111',
      canceledReason: 'no puedo ir',
      canceledBy: 'player',
      canceledAt: new Date('2026-08-19'),
      completedByStaff: 'staff-secret-id-2',
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-19'),
    }
    vi.mocked(cancelByPlayer).mockResolvedValueOnce({
      booking: fullBooking,
      pendingRefund: undefined,
      notificationIds: [],
    } as never)
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.booking).toEqual({
      id: 'booking-1',
      status: 'canceled_refunded',
      date: fullBooking.date,
      timeStart: '10:00',
      timeEnd: '11:00',
      depositStatus: 'refunded',
      depositAmount: 150000,
      priceSnapshot: 500000,
      canceledReason: 'no puedo ir',
      canceledAt: fullBooking.canceledAt,
    })
    expect(result.booking).not.toHaveProperty('notesInternal')
    expect(result.booking).not.toHaveProperty('createdByStaff')
    expect(result.booking).not.toHaveProperty('completedByStaff')
    expect(result.booking).not.toHaveProperty('paymentId')
    expect(result.booking).not.toHaveProperty('guestName')
    expect(result.booking).not.toHaveProperty('guestPhone')
  })
})
