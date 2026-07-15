import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix 2b (billing R2 🔴): `onPaymentApproved` (dunning.service.ts) solo
// reactiva cuando el preapproval del pago matchea `mp_subscription_id`
// vigente — pero esa verificación es inútil si el handler nunca le pasa el
// preapproval del pago. Este test prueba SOLO la plomería del handler: que
// `info.mpPaymentId`/`info.preapprovalId` (lo que devuelve
// `gateway.getPaymentStatus`) lleguen tal cual hasta `onPaymentApproved`.

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
  onPaymentApproved: vi.fn().mockResolvedValue({ alreadyProcessed: false }),
  onPaymentRejected: vi.fn().mockResolvedValue({ alreadyProcessed: false }),
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

import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { onPaymentApproved, onPaymentRejected } from '@/modules/billing/dunning.service'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockOnPaymentApproved = onPaymentApproved as ReturnType<typeof vi.fn>
const mockOnPaymentRejected = onPaymentRejected as ReturnType<typeof vi.fn>

const TENANT_ID = 'tenant-1'

function makeDbChain(rows: unknown[]) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  }
  return chain
}

function mockTx() {
  h.withTenantContext.mockImplementation(
    (async (_id: string, cb: (t: unknown) => Promise<unknown>) => cb({ execute: vi.fn() })) as never,
  )
}

const baseJob: MpWebhookJob = {
  tenantId: TENANT_ID,
  mpEventId: 'evt-sub-1',
  eventType: 'subscription_authorized_payment',
  mpPaymentId: 'mp-pay-1',
  rawPayload: { id: 'evt-sub-1', type: 'subscription_authorized_payment', data: { id: 'mp-pay-1' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeDbChain([{ id: TENANT_ID, mpAccessToken: null }]))
  mockTx()
  mockOnPaymentApproved.mockResolvedValue({ alreadyProcessed: false })
})

describe('handleMpWebhookJob — pasa mpPaymentId/preapprovalId a onPaymentApproved (Fix 2b plumbing)', () => {
  it('approved CON preapprovalId (cobro recurrente normal) → pasa ambos campos tal cual', async () => {
    mockGetBillingGateway.mockReturnValue({
      getPaymentStatus: vi.fn().mockResolvedValue({
        mpPaymentId: 'mp-pay-1',
        status: 'approved',
        amount: 5_500_000,
        externalReference: TENANT_ID,
        paymentMethodId: 'account_money',
        preapprovalId: 'mp-preapp-current',
      }),
    })

    await handleMpWebhookJob(baseJob)

    expect(mockOnPaymentApproved).toHaveBeenCalledTimes(1)
    expect(mockOnPaymentApproved).toHaveBeenCalledWith(
      TENANT_ID,
      'evt-sub-1',
      'subscription_authorized_payment',
      baseJob.rawPayload,
      expect.any(Date),
      expect.anything(), // tx
      'mp-pay-1',
      'mp-preapp-current',
    )
  })

  it('approved SIN preapprovalId (gateway/mock no lo trae) → pasa undefined, no lo inventa', async () => {
    mockGetBillingGateway.mockReturnValue({
      getPaymentStatus: vi.fn().mockResolvedValue({
        mpPaymentId: 'mp-pay-1',
        status: 'approved',
        amount: 5_500_000,
        externalReference: TENANT_ID,
        paymentMethodId: 'account_money',
        // sin preapprovalId
      }),
    })

    await handleMpWebhookJob(baseJob)

    expect(mockOnPaymentApproved).toHaveBeenCalledWith(
      TENANT_ID,
      'evt-sub-1',
      'subscription_authorized_payment',
      baseJob.rawPayload,
      expect.any(Date),
      expect.anything(),
      'mp-pay-1',
      undefined,
    )
  })

  it('rejected: onPaymentRejected sigue sin tocar (no forma parte de este fix)', async () => {
    mockGetBillingGateway.mockReturnValue({
      getPaymentStatus: vi.fn().mockResolvedValue({
        mpPaymentId: 'mp-pay-1',
        status: 'rejected',
        amount: 5_500_000,
        externalReference: TENANT_ID,
        paymentMethodId: 'account_money',
      }),
    })

    await handleMpWebhookJob(baseJob)

    expect(mockOnPaymentRejected).toHaveBeenCalledTimes(1)
    expect(mockOnPaymentApproved).not.toHaveBeenCalled()
  })
})
