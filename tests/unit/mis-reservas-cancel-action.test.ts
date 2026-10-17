import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BookingAlreadyEndedError,
  BookingNotCancelableError,
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'
import { bookingStatusEnum } from '@/shared/db/schema/enums'

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
// `after` fuera de un request tira; acá solo registra el callback para correrlo a mano.
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/modules/notifications/notification.service', () => ({ dispatchEmail: vi.fn() }))
// Reporte a Sentry con flush (`@/lib/sentry`): lo que tiene que usar el fallo del mail.
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect llamado')
  }),
}))

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { captureMessage } from '@/lib/sentry'
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
    // Transitorio: sin `stale` (queda inline en el diálogo) y sin revalidar.
    expect(result).toEqual({
      success: false,
      error: 'El complejo no está disponible para cancelar online.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('07-cancelbyplayer-noshow-guard: mapea BookingAlreadyEndedError a un error amigable', async () => {
    vi.mocked(cancelByPlayer).mockRejectedValueOnce(new BookingAlreadyEndedError(VALID_UUID))
    const result = await cancelMyBookingAction(VALID_UUID)
    // Error de estado: definitivo (`stale`) y refresca la lista.
    expect(result).toEqual({
      success: false,
      error: 'El turno ya terminó. Contactá al complejo.',
      stale: true,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/mis-reservas')
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
      // Pendiente = todavía no viajó por ningún lado. El medio y la fecha se
      // llenan recién cuando alguien la salda; con `state: 'pending'` la
      // pantalla ni los mira.
      settledMethod: null,
      settledAt: null,
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
      canceledReason: 'no puedo ir',
      canceledAt: fullBooking.canceledAt,
    })
    expect(result.booking).not.toHaveProperty('notesInternal')
    expect(result.booking).not.toHaveProperty('createdByStaff')
    expect(result.booking).not.toHaveProperty('completedByStaff')
    expect(result.booking).not.toHaveProperty('priceSnapshot')
    expect(result.booking).not.toHaveProperty('paymentId')
    expect(result.booking).not.toHaveProperty('guestName')
    expect(result.booking).not.toHaveProperty('guestPhone')
  })
})

const NOT_CANCELABLE_DEFAULT =
  'Esta reserva ya no se puede cancelar desde acá. Escribile al complejo.'

describe('cancelMyBookingAction — la reserva ya no se puede cancelar', () => {
  // Una fila por `booking_status`: si el enum suma un valor, el primer test se pone rojo.
  const COPY_POR_ESTADO = [
    ['canceled_refunded', 'admin', 'El complejo ya canceló esta reserva.'],
    ['canceled_no_refund', 'system', 'El complejo ya canceló esta reserva.'],
    ['canceled_no_refund', null, 'Esta reserva ya está cancelada.'],
    ['completed', null, 'Este turno ya se jugó.'],
    ['no_show', null, 'Este turno ya pasó.'],
    ['expired', null, 'Esta reserva venció.'],
    ['pending_payment', null, NOT_CANCELABLE_DEFAULT],
    ['confirmed', null, NOT_CANCELABLE_DEFAULT],
  ] as const

  it('hay copy para todos los booking_status', () => {
    const cubiertos = new Set<string>(COPY_POR_ESTADO.map(([status]) => status))
    expect(cubiertos).toEqual(new Set(bookingStatusEnum.enumValues))
  })

  it.each(COPY_POR_ESTADO)(
    '%s (cancelada por %s) → definitivo y con la lista refrescada',
    async (status, canceledBy, error) => {
      vi.mocked(cancelByPlayer).mockRejectedValueOnce(
        new BookingNotCancelableError(VALID_UUID, status, canceledBy),
      )
      expect(await cancelMyBookingAction(VALID_UUID)).toEqual({
        success: false,
        error,
        stale: true,
      })
      expect(revalidatePath).toHaveBeenCalledWith('/mis-reservas')
    },
  )

  it('BookingNotInConfirmedError pelado (la reserva desapareció) cae al copy por defecto', async () => {
    vi.mocked(cancelByPlayer).mockRejectedValueOnce(new BookingNotInConfirmedError(VALID_UUID))
    expect(await cancelMyBookingAction(VALID_UUID)).toEqual({
      success: false,
      error: NOT_CANCELABLE_DEFAULT,
      stale: true,
    })
  })
})

describe('cancelMyBookingAction — replay y despacho del mail', () => {
  const canceled = {
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
  const OUTCOME_CON_MAILS = { booking: canceled, notificationIds: ['n-1', 'n-2'] } as never

  beforeEach(() => {
    vi.mocked(dispatchEmail).mockReset()
  })

  it('replay: la misma respuesta de éxito, sin devolución ni mail, y refresca la lista', async () => {
    // `notificationIds` lleno a propósito: el service nunca lo hace en un replay,
    // pero la action tampoco tiene que despachar nada.
    vi.mocked(cancelByPlayer).mockResolvedValueOnce({
      booking: canceled,
      notificationIds: ['n-1'],
      replayed: true,
    } as never)
    const result = await cancelMyBookingAction(VALID_UUID)
    expect(result).toEqual({
      success: true,
      booking: expect.objectContaining({ id: 'booking-1', status: 'canceled_refunded' }),
    })
    expect(revalidatePath).toHaveBeenCalledWith('/mis-reservas')
    expect(after).not.toHaveBeenCalled()
  })

  it('el mail va en after(): la respuesta no espera el despacho y un vencimiento se reporta', async () => {
    // Un despacho que NO termina: si estuviera en la respuesta, la action se colgaría acá.
    vi.mocked(dispatchEmail).mockImplementation(() => new Promise(() => {}))
    vi.mocked(cancelByPlayer).mockResolvedValueOnce(OUTCOME_CON_MAILS)

    const result = await cancelMyBookingAction(VALID_UUID)

    expect(result.success).toBe(true)
    expect(after).toHaveBeenCalledTimes(1)
    expect(dispatchEmail).not.toHaveBeenCalled() // corre después de la respuesta
    const run = vi.mocked(after).mock.calls[0]![0] as () => Promise<void>
    vi.useFakeTimers()
    try {
      const done = run()
      await vi.advanceTimersByTimeAsync(60_000)
      await done
    } finally {
      vi.useRealTimers()
    }
    expect(vi.mocked(dispatchEmail).mock.calls.map(([id]) => id)).toEqual(['n-1', 'n-2'])
    expect(captureMessage).toHaveBeenCalledWith('email dispatch failed after player cancellation', {
      level: 'warning',
      extra: expect.objectContaining({ bookingId: VALID_UUID, notificationIds: ['n-1', 'n-2'] }),
    })
  })

  it('si el despacho falla se reporta a Sentry y la cancelación sigue siendo un éxito', async () => {
    vi.mocked(dispatchEmail).mockRejectedValue(new Error('pg-boss caído'))
    vi.mocked(cancelByPlayer).mockResolvedValueOnce(OUTCOME_CON_MAILS)

    expect((await cancelMyBookingAction(VALID_UUID)).success).toBe(true)
    await (vi.mocked(after).mock.calls[0]![0] as () => Promise<void>)()

    expect(captureMessage).toHaveBeenCalledWith('email dispatch failed after player cancellation', {
      level: 'warning',
      extra: expect.objectContaining({ error: 'pg-boss caído' }),
    })
  })
})
