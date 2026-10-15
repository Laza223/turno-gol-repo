import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reintentos de las acciones del panel sobre una reserva (demo 2026-10-14): el
// replay del mismo staff no vuelve a escribir (audit, strike, cobros, mail) y el
// mail de las acciones que lo mandan sale en `after()`, fuera de la respuesta.
// La detección del replay contra Postgres real está en
// tests/integration/admin-booking-replay.test.ts; acá, el cableado de las actions.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// `after` fuera de un request tira; acá solo registra el callback para correrlo a mano.
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/modules/staff/guards', () => ({ requireOperatorStaff: vi.fn() }))
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withTenantContext: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertAuditLog: vi.fn() }))
vi.mock('@/shared/api-output', () => ({ validateApiOutput: vi.fn() }))
vi.mock('@/modules/bookings/booking.service', () => ({
  completeBooking: vi.fn(),
  findCompletionReplay: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.cancellation', () => ({
  cancelByAdmin: vi.fn(),
  findNoShowReplay: vi.fn(),
  handleNoShow: vi.fn(),
}))
vi.mock('@/modules/bookings/booking.reschedule', () => ({ rescheduleBooking: vi.fn() }))
vi.mock('@/modules/payments/payment.service', () => ({ confirmManualDepositPayment: vi.fn() }))
vi.mock('@/modules/cashflow/cashflow.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/cashflow/cashflow.service')>()),
  createCashFlow: vi.fn(),
  resolveIdempotentCharges: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({ dispatchEmail: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { after } from 'next/server'
import {
  cancelBookingAction,
  completeAndChargeBookingAction,
  completeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
  rescheduleBookingAction,
} from '@/app/(admin)/reservas/actions'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { insertAuditLog } from '@/shared/db/audit'
import { completeBooking, findCompletionReplay } from '@/modules/bookings/booking.service'
import {
  cancelByAdmin,
  findNoShowReplay,
  handleNoShow,
} from '@/modules/bookings/booking.cancellation'
import { rescheduleBooking } from '@/modules/bookings/booking.reschedule'
import { confirmManualDepositPayment } from '@/modules/payments/payment.service'
import { createCashFlow, resolveIdempotentCharges } from '@/modules/cashflow/cashflow.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { captureMessage } from '@/lib/sentry'
import { BookingNotCancelableError } from '@/modules/bookings/booking.errors'

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const STAFF_ID = '44444444-4444-4444-8444-444444444444'
const KEY = '22222222-2222-4222-8222-222222222222'
const NOT_CONFIRMED = 'La reserva no está en estado confirmado.'

const completedRow = { id: BOOKING_ID, status: 'completed', type: 'player' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOperatorStaff).mockResolvedValue({
    ok: true,
    user: { staffUserId: STAFF_ID },
    tenant: { id: 'tenant-1' },
  } as never)
  vi.mocked(adminRateLimited).mockResolvedValue(null as never)
  vi.mocked(withTenantContext).mockImplementation((async (
    _id: string,
    cb: (t: never) => Promise<unknown>,
  ) => cb({ execute: vi.fn() } as never)) as never)
})

describe('completeBookingAction — replay', () => {
  it('reintento del mismo staff: éxito con el estado actual, sin completeBooking ni audit', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue(completedRow as never)

    const res = await completeBookingAction(BOOKING_ID)

    expect(res).toEqual({ success: true, booking: completedRow })
    expect(findCompletionReplay).toHaveBeenCalledWith(BOOKING_ID, STAFF_ID, expect.anything())
    expect(completeBooking).not.toHaveBeenCalled()
    expect(insertAuditLog).not.toHaveBeenCalled()
  })
})

describe('completeAndChargeBookingAction — replay', () => {
  it('sin cobros: éxito sin escribir', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue(completedRow as never)

    const res = await completeAndChargeBookingAction({ bookingId: BOOKING_ID, charges: [] })

    expect(res).toEqual({ success: true, booking: completedRow })
    expect(completeBooking).not.toHaveBeenCalled()
    expect(createCashFlow).not.toHaveBeenCalled()
  })

  it('con nota de deuda ya guardada por el primer pedido: éxito sin escribir', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue({
      ...completedRow,
      notesInternal: 'llegaron tarde\n[Deuda] debe la mitad',
    } as never)

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [],
      debtNote: ' debe la mitad ',
    })

    expect(res.success).toBe(true)
    expect(completeBooking).not.toHaveBeenCalled()
  })

  it('con nota de deuda que NO quedó guardada (se completó por otro camino): error de estado', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue({
      ...completedRow,
      notesInternal: null,
    } as never)

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [],
      debtNote: 'debe la mitad',
    })

    expect(res).toEqual({ success: false, error: NOT_CONFIRMED })
    expect(completeBooking).not.toHaveBeenCalled()
  })

  it('cobros ya registrados con la misma key: éxito sin volver a cobrar', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue(completedRow as never)
    vi.mocked(resolveIdempotentCharges).mockResolvedValue({ ok: true, newChargingCents: 0 })

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 10_000, method: 'cash' }],
      clientIdempotencyKey: KEY,
    })

    expect(res.success).toBe(true)
    expect(createCashFlow).not.toHaveBeenCalled()
  })

  it('trae un cobro NUEVO sobre un turno ya completado: error de estado, no cobra', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue(completedRow as never)
    vi.mocked(resolveIdempotentCharges).mockResolvedValue({ ok: true, newChargingCents: 10_000 })

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 10_000, method: 'cash' }],
    })

    expect(res).toEqual({ success: false, error: NOT_CONFIRMED })
    expect(createCashFlow).not.toHaveBeenCalled()
  })

  it('misma key con otro monto: el conflicto de cobro, no un éxito', async () => {
    vi.mocked(findCompletionReplay).mockResolvedValue(completedRow as never)
    vi.mocked(resolveIdempotentCharges).mockResolvedValue({
      ok: false,
      registeredCents: 5_000,
      error: 'conflicto',
    })

    const res = await completeAndChargeBookingAction({
      bookingId: BOOKING_ID,
      charges: [{ amount: 10_000, method: 'cash' }],
      clientIdempotencyKey: KEY,
    })

    expect(res).toEqual({ success: false, error: 'conflicto' })
    expect(createCashFlow).not.toHaveBeenCalled()
  })
})

describe('markNoShowAction — replay', () => {
  it('reintento del mismo staff: éxito sin handleNoShow (ni audit ni strike)', async () => {
    const noShow = { id: BOOKING_ID, status: 'no_show' }
    vi.mocked(findNoShowReplay).mockResolvedValue(noShow as never)

    const res = await markNoShowAction(BOOKING_ID)

    expect(res).toEqual({ success: true, booking: noShow })
    expect(handleNoShow).not.toHaveBeenCalled()
  })

  it('no es replay: sigue a handleNoShow con sus errores de siempre', async () => {
    vi.mocked(findNoShowReplay).mockResolvedValue(null)
    vi.mocked(handleNoShow).mockRejectedValue(
      new BookingNotCancelableError(BOOKING_ID, 'canceled_no_refund', 'admin'),
    )

    expect(await markNoShowAction(BOOKING_ID)).toEqual({ success: false, error: NOT_CONFIRMED })
  })
})

describe('cancelBookingAction — replay y mail en after()', () => {
  const canceled = { id: BOOKING_ID, status: 'canceled_no_refund' }

  it('replay: éxito y ningún mail', async () => {
    vi.mocked(cancelByAdmin).mockResolvedValue({
      booking: canceled,
      notificationIds: [],
      replayed: true,
    } as never)

    const res = await cancelBookingAction(BOOKING_ID, 'lluvia', 'complejo')

    expect(res).toEqual({ success: true, booking: canceled })
    expect(after).not.toHaveBeenCalled()
  })

  it('error de estado real: conserva su texto', async () => {
    vi.mocked(cancelByAdmin).mockRejectedValue(
      new BookingNotCancelableError(BOOKING_ID, 'canceled_no_refund', 'player'),
    )

    expect(await cancelBookingAction(BOOKING_ID, 'lluvia', 'complejo')).toEqual({
      success: false,
      error: NOT_CONFIRMED,
    })
  })

  it('el mail va en after(): la respuesta no espera el despacho y un vencimiento se reporta', async () => {
    // Un despacho que NO termina: si estuviera en la respuesta, la action se colgaría acá.
    vi.mocked(dispatchEmail).mockImplementation(() => new Promise(() => {}))
    vi.mocked(cancelByAdmin).mockResolvedValue({
      booking: canceled,
      notificationIds: ['n-1'],
    } as never)

    const res = await cancelBookingAction(BOOKING_ID, 'lluvia', 'complejo')

    expect(res.success).toBe(true)
    expect(after).toHaveBeenCalledTimes(1)
    expect(dispatchEmail).not.toHaveBeenCalled()
    const run = vi.mocked(after).mock.calls[0]![0] as () => Promise<void>
    vi.useFakeTimers()
    try {
      const done = run()
      await vi.advanceTimersByTimeAsync(60_000)
      await done
    } finally {
      vi.useRealTimers()
    }
    expect(dispatchEmail).toHaveBeenCalledWith('n-1')
    expect(captureMessage).toHaveBeenCalledWith('email dispatch failed after admin cancellation', {
      level: 'warning',
      extra: expect.objectContaining({ bookingId: BOOKING_ID, notificationIds: ['n-1'] }),
    })
  })
})

describe('mail en after() — confirmar seña y reprogramar', () => {
  it('confirmar seña: despacha después de responder y un fallo se reporta', async () => {
    vi.mocked(dispatchEmail).mockRejectedValue(new Error('pg-boss caído'))
    vi.mocked(confirmManualDepositPayment).mockResolvedValue({
      won: true,
      booking: { id: BOOKING_ID },
      notificationIds: ['n-2'],
    } as never)

    expect((await confirmDepositPaymentAction(BOOKING_ID, 'cash')).success).toBe(true)
    expect(dispatchEmail).not.toHaveBeenCalled()
    await (vi.mocked(after).mock.calls[0]![0] as () => Promise<void>)()

    expect(captureMessage).toHaveBeenCalledWith(
      'email dispatch failed after manual deposit confirmation',
      { level: 'warning', extra: expect.objectContaining({ error: 'pg-boss caído' }) },
    )
  })

  it('reprogramar: despacha después de responder', async () => {
    vi.mocked(dispatchEmail).mockResolvedValue(undefined as never)
    vi.mocked(rescheduleBooking).mockResolvedValue({
      booking: { id: BOOKING_ID },
      notificationIds: ['n-3'],
      priceChanged: false,
    } as never)

    const res = await rescheduleBookingAction({
      bookingId: BOOKING_ID,
      courtId: '33333333-3333-4333-8333-333333333333',
      date: '2030-01-01',
      timeStart: '10:00',
      timeEnd: '11:00',
    })

    expect(res).toMatchObject({ success: true })
    expect(dispatchEmail).not.toHaveBeenCalled()
    await (vi.mocked(after).mock.calls[0]![0] as () => Promise<void>)()
    expect(dispatchEmail).toHaveBeenCalledWith('n-3')
  })

  it('sin notificaciones no agenda nada', async () => {
    vi.mocked(confirmManualDepositPayment).mockResolvedValue({
      won: true,
      booking: { id: BOOKING_ID },
      notificationIds: [],
    } as never)

    await confirmDepositPaymentAction(BOOKING_ID, 'cash')
    expect(after).not.toHaveBeenCalled()
  })
})
