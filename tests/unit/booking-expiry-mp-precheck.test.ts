import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-16: expirePendingBookingWithPolicy debe consultar a MP antes de expirar
// un booking cuyo checkout ya arrancó — si la seña ya fue aprobada pero el
// webhook no llegó a tiempo, el turno se confirma en vez de perderse.

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  withTenantContext: vi.fn(),
}))
vi.mock('@/shared/jobs/schedule-expiry', () => ({
  scheduleBookingExpiry: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueNotification: vi.fn(),
  enqueueTenantOwnerNotification: vi.fn(),
  dispatchEmail: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: vi.fn(),
}))
vi.mock('@/modules/payments/mp-reconcile.service', () => {
  class ReconcileProcessingError extends Error {
    constructor(
      public readonly bookingId: string,
      public readonly cause: unknown,
    ) {
      super(`reconcile processing failed for booking ${bookingId}`)
      this.name = 'ReconcileProcessingError'
    }
  }
  return {
    reconcileApprovedPaymentForBooking: vi.fn(),
    ReconcileProcessingError,
  }
})
vi.mock('@/modules/notifications/push.service', () => ({
  notifyAdminBookingConfirmed: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { payment: vi.fn() },
}))
vi.mock('@/modules/bookings/booking.service', () => ({
  expirePendingBooking: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/sentry', () => ({
  captureMessage: vi.fn(),
}))

import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import {
  reconcileApprovedPaymentForBooking,
  ReconcileProcessingError,
} from '@/modules/payments/mp-reconcile.service'
import { notifyAdminBookingConfirmed } from '@/modules/notifications/push.service'
import { expirePendingBooking } from '@/modules/bookings/booking.service'
import { scheduleBookingExpiry } from '@/shared/jobs/schedule-expiry'
import { logger } from '@/shared/lib/logger'
import { captureMessage } from '@/lib/sentry'
import { expirePendingBookingWithPolicy } from '@/modules/bookings/booking.expiry'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockResolveGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockReconcile = reconcileApprovedPaymentForBooking as ReturnType<typeof vi.fn>
const mockNotifyPush = notifyAdminBookingConfirmed as ReturnType<typeof vi.fn>
const mockDispatchEmail = dispatchEmail as ReturnType<typeof vi.fn>
const mockExpirePendingBooking = expirePendingBooking as ReturnType<typeof vi.fn>
const mockScheduleExpiry = scheduleBookingExpiry as ReturnType<typeof vi.fn>
const mockCaptureMessage = captureMessage as ReturnType<typeof vi.fn>

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = 'tenant-1'

/** Fila que `loadExpiryState` devolvería, ya pasado el cutoff de 6min. */
function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    status: 'pending_payment',
    createdAt: new Date(Date.now() - 20 * 60 * 1000),
    tenantId: TENANT_ID,
    playerId: null,
    date: '2099-08-10',
    timeStart: '10:00:00',
    courtName: 'Cancha 1',
    tenantName: 'Complejo X',
    playerFirstName: null,
    hasInProcess: false,
    mpAccessToken: 'encrypted-token',
    hasMpCheckout: true,
    ...overrides,
  }
}

/** Stub del pool worker: la única query de `loadExpiryState` devuelve `rows`. */
function mockLoadExpiryState(rows: unknown[]) {
  const sqlStub = vi.fn().mockResolvedValue(rows)
  mockGetWorkerSql.mockReturnValue(sqlStub as unknown as ReturnType<typeof getWorkerSql>)
}

/** El flujo normal de expiración corre dentro de `withTenantContext`. */
function mockExpireTx(won: boolean) {
  mockWithTenantContext.mockImplementation(
    (async (_id: string, cb: (t: never) => Promise<unknown>) => cb({} as never)) as never,
  )
  mockExpirePendingBooking.mockResolvedValue(won ? { won: true } : { won: false })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('expirePendingBookingWithPolicy — precheck MP (ENS-16)', () => {
  it('(a) pago approved en MP → confirmed, NO expira, dispara push y emails', async () => {
    mockLoadExpiryState([baseRow()])
    const fakeGateway = { searchPaymentsByReference: vi.fn() }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockReconcile.mockResolvedValue({ confirmed: true, notificationIds: ['notif-1'] })

    const action = await expirePendingBookingWithPolicy(BOOKING_ID)

    expect(action).toBe('confirmed')
    expect(mockResolveGateway).toHaveBeenCalledWith(TENANT_ID, 'encrypted-token')
    expect(mockReconcile).toHaveBeenCalledWith(
      BOOKING_ID,
      TENANT_ID,
      fakeGateway,
      'expiry-precheck',
    )
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-1')
    expect(mockNotifyPush).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID)
    // No tocó el flujo normal de expiración.
    expect(mockWithTenantContext).not.toHaveBeenCalled()
    expect(mockExpirePendingBooking).not.toHaveBeenCalled()
  })

  it('(b) sin checkout MP iniciado → expira como hoy, sin consultar a MP', async () => {
    mockLoadExpiryState([baseRow({ hasMpCheckout: false })])
    mockExpireTx(true)

    const action = await expirePendingBookingWithPolicy(BOOKING_ID)

    expect(action).toBe('expired')
    expect(mockResolveGateway).not.toHaveBeenCalled()
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(mockNotifyPush).not.toHaveBeenCalled()
    expect(mockExpirePendingBooking).toHaveBeenCalled()
  })

  it('(c) MP tira error/timeout → loguea y expira igual (la red del punto 2 rescata)', async () => {
    mockLoadExpiryState([baseRow()])
    const fakeGateway = { searchPaymentsByReference: vi.fn() }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockReconcile.mockRejectedValue(new Error('MP timeout'))
    mockExpireTx(true)

    const action = await expirePendingBookingWithPolicy(BOOKING_ID)

    expect(action).toBe('expired')
    expect(logger.error).toHaveBeenCalledWith(
      'expiry precheck against MP failed',
      expect.objectContaining({ bookingId: BOOKING_ID }),
    )
    expect(mockNotifyPush).not.toHaveBeenCalled()
    expect(mockExpirePendingBooking).toHaveBeenCalled()
  })

  // R1-A (rechazo review): si MP YA dijo approved (fase search exitosa) pero el
  // procesamiento LOCAL después falla (DB, recordDepositCashFlow, etc.), el
  // catch anterior trataba esto igual que "MP no contestó" y expiraba una
  // reserva PAGADA. Ahora reconcileApprovedPaymentForBooking distingue esa
  // fase envolviendo el error en ReconcileProcessingError — acá NUNCA se
  // expira, se reintenta en 120s.
  it('(d) R1-A: MP approved pero el procesamiento local falla → rescheduled, reintento en 120s, JAMÁS expira', async () => {
    mockLoadExpiryState([baseRow()])
    const fakeGateway = { searchPaymentsByReference: vi.fn() }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockReconcile.mockRejectedValue(
      new ReconcileProcessingError(BOOKING_ID, new Error('db down mid-confirm')),
    )

    const action = await expirePendingBookingWithPolicy(BOOKING_ID)

    expect(action).toBe('rescheduled')
    expect(mockScheduleExpiry).toHaveBeenCalledWith(BOOKING_ID, 120)
    expect(mockExpirePendingBooking).not.toHaveBeenCalled()
    expect(mockWithTenantContext).not.toHaveBeenCalled()
    expect(mockNotifyPush).not.toHaveBeenCalled()
    // (control) falla reciente — recién vencido hace 14min (< umbral de 1h
    // desde que DEBIÓ expirar) — todavía no amerita alertar a un humano.
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  // R4 (ensayo general): si ReconcileProcessingError es determinístico, el
  // retry de 120s de arriba loopea para siempre sin que nadie se entere
  // (logger.error solo pega a stderr, el job pg-boss "completa" cada vez).
  // Pasado 1h desde que el booking DEBIÓ expirar, cada retry además alerta a
  // Sentry.
  it('(e) R4: procesamiento local sigue fallando con >1h vencido → alerta a Sentry en cada retry', async () => {
    // cutoff = 6min; createdAt 71min atrás → venció (createdAt+6min) hace 65min (>1h).
    mockLoadExpiryState([baseRow({ createdAt: new Date(Date.now() - 71 * 60 * 1000) })])
    const fakeGateway = { searchPaymentsByReference: vi.fn() }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockReconcile.mockRejectedValue(
      new ReconcileProcessingError(BOOKING_ID, new Error('db down mid-confirm')),
    )

    const action = await expirePendingBookingWithPolicy(BOOKING_ID)

    expect(action).toBe('rescheduled')
    expect(mockScheduleExpiry).toHaveBeenCalledWith(BOOKING_ID, 120)
    expect(mockExpirePendingBooking).not.toHaveBeenCalled()
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [message, opts] = mockCaptureMessage.mock.calls[0]!
    expect(message).toBe(
      'expiry precheck: MP approved pero el procesamiento local falló — reintento en 120s',
    )
    expect(opts).toMatchObject({
      level: 'error',
      extra: expect.objectContaining({
        bookingId: BOOKING_ID,
        tenantId: TENANT_ID,
        error: 'db down mid-confirm',
      }),
    })
    expect(opts.extra.elapsedMs).toBeGreaterThan(60 * 60 * 1000)
  })
})
