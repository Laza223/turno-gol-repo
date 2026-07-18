import { beforeEach, describe, expect, it, vi } from 'vitest'

// R1-B barrido de clase (extensión del contrato de M1): handleMpWebhookJob
// gateaba `confirmedBookingId` (y por lo tanto el push "Nueva reserva" al
// admin) en `depositOutcome.result === 'confirmed'` — ese campo dice que MP
// aprobó el PAGO, no que transitionFromPendingPayment haya ganado la
// transición del booking (`won`). Sobre un booking ya post-terminal (un
// webhook real que llega tarde, después de que `booking.expiry.ts` ya lo
// expiró) esto disparaba un push falso de "nueva reserva confirmada" además
// del email admin_late_payment correcto. Fix: gatear el push en
// `won === true`, sin tocar el resto del handler (emails, dunning, upgrade).

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  withTenantContext: vi.fn(),
}))

vi.mock('@/shared/db/client', () => ({
  getDb: h.getDb,
  withTenantContext: h.withTenantContext,
}))
vi.mock('@/modules/payments/mp-oauth', () => ({
  resolveTenantGateway: vi.fn(),
}))
vi.mock('@/modules/payments/payment.service', () => ({
  dispatchPaymentInfo: vi.fn(),
  lockMpEvent: vi.fn(),
}))
vi.mock('@/modules/billing/dunning.service', () => ({
  onPaymentApproved: vi.fn(),
  onPaymentRejected: vi.fn(),
}))
vi.mock('@/modules/billing/billing.service', () => ({
  handleUpgradeApproved: vi.fn(),
}))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  dispatchEmail: vi.fn(),
}))
vi.mock('@/modules/notifications/push.service', () => ({
  notifyAdminBookingConfirmed: vi.fn(),
}))
vi.mock('@/shared/observability', () => ({
  track: { webhook: vi.fn(), payment: vi.fn() },
}))

import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { dispatchPaymentInfo, lockMpEvent } from '@/modules/payments/payment.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { notifyAdminBookingConfirmed } from '@/modules/notifications/push.service'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockResolveGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>
const mockDispatchPaymentInfo = dispatchPaymentInfo as ReturnType<typeof vi.fn>
const mockDispatchEmail = dispatchEmail as ReturnType<typeof vi.fn>
const mockNotifyPush = notifyAdminBookingConfirmed as ReturnType<typeof vi.fn>

const TENANT_ID = 'tenant-1'
const BOOKING_ID = 'booking-1'

/** Chain mínima para `getDb().select({...}).from(tenants).where(...).limit(1)`. */
function makeDbChain(rows: unknown[]) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  }
  return chain
}

/** withTenantContext corre el callback con un tx cuyo único `execute()` (el
 * SELECT tenant_id de la reserva, para el cross-check) devuelve `bookingRows`. */
function mockTx(bookingRows: unknown[]) {
  const execute = vi.fn().mockResolvedValue(bookingRows)
  h.withTenantContext.mockImplementation(
    (async (_id: string, cb: (t: unknown) => Promise<unknown>) => cb({ execute })) as never,
  )
}

const baseJob: MpWebhookJob = {
  tenantId: TENANT_ID,
  mpEventId: 'evt-1',
  eventType: 'payment',
  mpPaymentId: 'mp-1',
  rawPayload: {},
}

const approvedInfo = {
  mpPaymentId: 'mp-1',
  status: 'approved' as const,
  amount: 1000,
  externalReference: BOOKING_ID,
  paymentMethodId: 'account_money',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeDbChain([{ id: TENANT_ID, mpAccessToken: 'encrypted-tok' }]))
  mockResolveGateway.mockReturnValue({ getPaymentStatus: vi.fn().mockResolvedValue(approvedInfo) })
  mockLockMpEvent.mockResolvedValue(true)
  mockTx([{ tenant_id: TENANT_ID }])
})

describe('handleMpWebhookJob — booking deposit, gate del push (R1-B barrido de clase)', () => {
  it('won:true → dispara push de admin además de los emails encolados', async () => {
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['notif-1'],
      won: true,
    })

    await handleMpWebhookJob(baseJob)

    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-1')
    expect(mockNotifyPush).toHaveBeenCalledWith(TENANT_ID, BOOKING_ID)
  })

  it('won:false (pago tardío sobre booking ya post-terminal) → NO dispara push, pero SÍ el email admin_late_payment', async () => {
    mockDispatchPaymentInfo.mockResolvedValue({
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: ['notif-late-payment'],
      won: false,
    })

    await handleMpWebhookJob(baseJob)

    expect(mockDispatchEmail).toHaveBeenCalledWith('notif-late-payment')
    expect(mockNotifyPush).not.toHaveBeenCalled()
  })
})
