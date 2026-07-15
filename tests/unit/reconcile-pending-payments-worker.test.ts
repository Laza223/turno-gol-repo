import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-15 (push al admin en confirmaciones por reconciliación) + ENS-16
// (rescate post-terminal de bookings ya `expired` con un pago approved
// huérfano). `reconcileApprovedPaymentForBooking` se mockea como frontera de
// módulo — su propia lógica interna se cubre en mp-reconcile-service.test.ts.

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: vi.fn(),
  withTenantContext: vi.fn(),
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: vi.fn(),
}))
vi.mock('@/modules/payments/payment.service', () => ({
  dispatchPaymentInfo: vi.fn(),
  lockMpEvent: vi.fn(),
}))
vi.mock('@/modules/payments/mp-reconcile.service', () => ({
  reconcileApprovedPaymentForBooking: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  dispatchEmail: vi.fn(),
}))
vi.mock('@/modules/notifications/push.service', () => ({
  notifyAdminBookingConfirmed: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { payment: vi.fn() },
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { dispatchPaymentInfo, lockMpEvent } from '@/modules/payments/payment.service'
import { reconcileApprovedPaymentForBooking } from '@/modules/payments/mp-reconcile.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { notifyAdminBookingConfirmed } from '@/modules/notifications/push.service'
import { reconcilePendingPayments } from '@/shared/jobs/workers/reconcile-pending-payments.worker'

const mockGetWorkerSql = getWorkerSql as ReturnType<typeof vi.fn>
const mockWithTenantContext = withTenantContext as ReturnType<typeof vi.fn>
const mockResolveGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>
const mockDispatchPaymentInfo = dispatchPaymentInfo as ReturnType<typeof vi.fn>
const mockReconcile = reconcileApprovedPaymentForBooking as ReturnType<typeof vi.fn>
const mockDispatchEmail = dispatchEmail as ReturnType<typeof vi.fn>
const mockNotifyPush = notifyAdminBookingConfirmed as ReturnType<typeof vi.fn>

const TENANT_ID = 'tenant-1'
const BOOKING_ID = 'booking-1'

/** El worker hace 2 SELECTs (stuck pending_payment, luego expired huérfanos). */
function mockTwoQueries(stuckRows: unknown[], orphanedRows: unknown[]) {
  let call = 0
  const sqlStub = vi.fn().mockImplementation(async () => {
    call += 1
    return call === 1 ? stuckRows : orphanedRows
  })
  mockGetWorkerSql.mockReturnValue(sqlStub as unknown as ReturnType<typeof getWorkerSql>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reconcilePendingPayments — loop pending_payment (ENS-15 push)', () => {
  it('(f) confirma un booking stuck → dispara push al admin además del email', async () => {
    mockTwoQueries(
      [{ bookingId: BOOKING_ID, tenantId: TENANT_ID, mpAccessToken: 'tok' }],
      [],
    )
    const fakeGateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([
        { mpPaymentId: 'mp-1', status: 'approved', amount: 100, externalReference: BOOKING_ID, paymentMethodId: 'x' },
      ]),
    }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockWithTenantContext.mockImplementation(
      (async (_id: string, cb: (t: never) => Promise<unknown>) => cb({} as never)) as never,
    )
    mockLockMpEvent.mockResolvedValue(true)
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['notif-1'],
      won: true,
    })
    mockReconcile.mockResolvedValue({ confirmed: false, notificationIds: [] })

    const total = await reconcilePendingPayments()

    expect(total).toBe(1)
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-1')
    expect(mockNotifyPush).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID)
  })

  // R1-B barrido de clase (extensión del contrato de M1): este loop llama
  // dispatchPaymentInfo DIRECTO (no pasa por reconcileApprovedPaymentForBooking,
  // que ya deriva confirmed de won) — antes pusheaba con outcome.result==='confirmed'
  // sin mirar won, mismo bug que mp-webhook.handler.ts y que el rescate
  // post-terminal de este mismo archivo.
  it('(g) R1-B: won:false (booking ya salió de pending_payment por otro camino) → NO dispara push, pero el email SÍ sale', async () => {
    mockTwoQueries(
      [{ bookingId: BOOKING_ID, tenantId: TENANT_ID, mpAccessToken: 'tok' }],
      [],
    )
    const fakeGateway = {
      searchPaymentsByReference: vi.fn().mockResolvedValue([
        { mpPaymentId: 'mp-1', status: 'approved', amount: 100, externalReference: BOOKING_ID, paymentMethodId: 'x' },
      ]),
    }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockWithTenantContext.mockImplementation(
      (async (_id: string, cb: (t: never) => Promise<unknown>) => cb({} as never)) as never,
    )
    mockLockMpEvent.mockResolvedValue(true)
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['notif-late-payment'],
      won: false,
    })
    mockReconcile.mockResolvedValue({ confirmed: false, notificationIds: [] })

    await reconcilePendingPayments()

    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-late-payment')
    expect(mockNotifyPush).not.toHaveBeenCalled()
  })

  it('sin bookings stuck ni huérfanos → 0, no llama nada más', async () => {
    mockTwoQueries([], [])

    const total = await reconcilePendingPayments()

    expect(total).toBe(0)
    expect(mockResolveGateway).not.toHaveBeenCalled()
    expect(mockNotifyPush).not.toHaveBeenCalled()
  })
})

describe('reconcilePendingPayments — rescate post-terminal (ENS-16)', () => {
  it('(d)+(f) expired con approved huérfano → reconcileApprovedPaymentForBooking confirma, dispara email y push', async () => {
    mockTwoQueries([], [{ bookingId: BOOKING_ID, tenantId: TENANT_ID, mpAccessToken: 'tok' }])
    const fakeGateway = { searchPaymentsByReference: vi.fn() }
    mockResolveGateway.mockReturnValue(fakeGateway)
    mockReconcile.mockResolvedValue({ confirmed: true, notificationIds: ['notif-2'] })

    const total = await reconcilePendingPayments()

    expect(total).toBe(1)
    expect(mockResolveGateway).toHaveBeenCalledWith(TENANT_ID, 'tok')
    expect(mockReconcile).toHaveBeenCalledWith(
      BOOKING_ID,
      TENANT_ID,
      fakeGateway,
      'reconcile-post-terminal',
    )
    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-2')
    expect(mockNotifyPush).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID)
  })

  it('(e) reconcileApprovedPaymentForBooking devuelve confirmed:false (lock ya usado) → no reprocesa', async () => {
    mockTwoQueries([], [{ bookingId: BOOKING_ID, tenantId: TENANT_ID, mpAccessToken: 'tok' }])
    mockResolveGateway.mockReturnValue({ searchPaymentsByReference: vi.fn() })
    mockReconcile.mockResolvedValue({ confirmed: false, notificationIds: [] })

    const total = await reconcilePendingPayments()

    expect(total).toBe(0)
    expect(mockDispatchEmail).not.toHaveBeenCalled()
    expect(mockNotifyPush).not.toHaveBeenCalled()
  })

  it('corre el rescate post-terminal incluso si NO había bookings stuck en pending_payment', async () => {
    mockTwoQueries([], [{ bookingId: BOOKING_ID, tenantId: TENANT_ID, mpAccessToken: 'tok' }])
    mockResolveGateway.mockReturnValue({ searchPaymentsByReference: vi.fn() })
    mockReconcile.mockResolvedValue({ confirmed: true, notificationIds: [] })

    const total = await reconcilePendingPayments()

    expect(total).toBe(1)
    expect(mockReconcile).toHaveBeenCalledTimes(1)
  })
})
