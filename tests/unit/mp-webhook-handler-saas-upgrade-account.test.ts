/**
 * TG-P1-MP-02: qué cuenta de MercadoPago se usa para un evento `payment`.
 *
 * El proraeo de un upgrade de plan llega como `payment` — el MISMO tipo que la
 * seña de una reserva — pero su preferencia la creó la cuenta MASTER de
 * TurnoGol, no el MP del complejo. El handler elegía la cuenta sólo por tipo de
 * evento, así que consultaba ese pago con el token OAuth del complejo: MP no
 * encuentra un pago de otra cuenta, el job falla y el upgrade nunca se aplica
 * pese a estar cobrado. Un complejo que nunca conectó MP para señas ni siquiera
 * llegaba hasta ahí. Era el motivo por el que `/api/billing/upgrade` devolvía
 * 501 detrás del flag `saas_upgrade`.
 *
 * El discriminador es el `&source=saas` que TurnoGol mismo pone en la
 * `notification_url` (billing.service.computeNotificationUrl), verificado
 * contra el `external_reference` real del pago.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  dispatchPaymentInfo: vi.fn().mockResolvedValue({ alreadyProcessed: false }),
  lockMpEvent: vi.fn().mockResolvedValue(true),
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
import { handleUpgradeApproved } from '@/modules/billing/billing.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { lockMpEvent } from '@/modules/payments/payment.service'
import { buildSaasUpgradeRef } from '@/modules/payments/payment.types'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockResolveTenantGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockHandleUpgradeApproved = handleUpgradeApproved as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>

const TENANT_ID = 'tenant-1'
const TARGET_PLAN_ID = 'plan-estadio'
const UPGRADE_REF = buildSaasUpgradeRef(TENANT_ID, TARGET_PLAN_ID)

/** `mpAccessToken: null` = el complejo NUNCA conectó MP para cobrar señas. */
function makeDbChain(mpAccessToken: string | null) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([{ id: TENANT_ID, mpAccessToken }]),
    execute: () => Promise.resolve([]), // pre-check de duplicados: no visto
  }
  return chain
}

function gatewayReturning(externalReference: string) {
  return {
    getPaymentStatus: vi.fn().mockResolvedValue({
      mpPaymentId: 'mp-pay-1',
      status: 'approved',
      amount: 3_000_000,
      externalReference,
      paymentMethodId: 'visa',
    }),
  }
}

function job(overrides: Partial<MpWebhookJob> = {}): MpWebhookJob {
  return {
    tenantId: TENANT_ID,
    mpEventId: 'evt-1',
    eventType: 'payment',
    mpPaymentId: 'mp-pay-1',
    rawPayload: { id: 'evt-1', type: 'payment', data: { id: 'mp-pay-1' } },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // `execute` devuelve `[]`: la rama de seña sigue de largo hasta buscar el
  // booking del `external_reference`, y con cero filas corta sin tocar nada —
  // que es todo lo que necesita este test, cuyo objeto es la elección de cuenta.
  h.withTenantContext.mockImplementation(
    (async (_id: string, cb: (t: unknown) => Promise<unknown>) =>
      cb({ execute: vi.fn().mockResolvedValue([]) })) as never,
  )
  mockLockMpEvent.mockResolvedValue(true)
})

describe('handleMpWebhookJob — elección de cuenta MP para eventos `payment`', () => {
  it('source=saas → cuenta MASTER, incluso si el complejo nunca conectó su MP', async () => {
    // La regresión concreta: sin el fix esto tiraba TenantMpNotConnectedError
    // antes de llegar a mirar el pago, y el upgrade cobrado nunca se aplicaba.
    h.getDb.mockReturnValue(makeDbChain(null))
    const master = gatewayReturning(UPGRADE_REF)
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job({ source: 'saas' }))

    expect(mockGetBillingGateway).toHaveBeenCalledTimes(1)
    expect(mockResolveTenantGateway).not.toHaveBeenCalled()
    expect(master.getPaymentStatus).toHaveBeenCalledWith('mp-pay-1')
  })

  it('source=saas → handleUpgradeApproved recibe el gateway MASTER, no el del complejo', async () => {
    // No alcanza con consultar el pago con la cuenta correcta:
    // `handleUpgradeApproved` usa ese mismo gateway para
    // `updatePreapprovalAmount`, y el preapproval también es del master.
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    const master = gatewayReturning(UPGRADE_REF)
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job({ source: 'saas' }))

    expect(mockHandleUpgradeApproved).toHaveBeenCalledTimes(1)
    const [tenantId, planId, gatewayArg] = mockHandleUpgradeApproved.mock.calls[0] as [
      string,
      string,
      unknown,
    ]
    expect(tenantId).toBe(TENANT_ID)
    expect(planId).toBe(TARGET_PLAN_ID)
    expect(gatewayArg).toBe(master)
  })

  it('sin source (seña de reserva) → sigue usando el MP del complejo', async () => {
    // Control positivo: el fix no debe desviar las señas a la cuenta master.
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    const tenantGw = gatewayReturning('booking-abc')
    mockResolveTenantGateway.mockReturnValue(tenantGw)

    await handleMpWebhookJob(job())

    expect(mockResolveTenantGateway).toHaveBeenCalledWith(TENANT_ID, 'token-del-complejo')
    expect(mockGetBillingGateway).not.toHaveBeenCalled()
    expect(mockHandleUpgradeApproved).not.toHaveBeenCalled()
  })

  it('source=saas sobre una seña → corta, no aplica plata por la rama equivocada', async () => {
    // Quien tenga el secreto del webhook no puede resolver una seña contra la
    // cuenta master mintiendo en la query.
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    mockGetBillingGateway.mockReturnValue(gatewayReturning('booking-abc'))

    await expect(handleMpWebhookJob(job({ source: 'saas' }))).rejects.toThrow(
      /source mismatch/i,
    )
    expect(mockHandleUpgradeApproved).not.toHaveBeenCalled()
  })

  it('referencia de upgrade sin source → corta en vez de seguir con la cuenta equivocada', async () => {
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    mockResolveTenantGateway.mockReturnValue(gatewayReturning(UPGRADE_REF))

    await expect(handleMpWebhookJob(job())).rejects.toThrow(/source mismatch/i)
    expect(mockHandleUpgradeApproved).not.toHaveBeenCalled()
  })

  it('el cross-check de tenant sigue vivo: ref de OTRO complejo → corta', async () => {
    h.getDb.mockReturnValue(makeDbChain(null))
    mockGetBillingGateway.mockReturnValue(
      gatewayReturning(buildSaasUpgradeRef('tenant-ajeno', TARGET_PLAN_ID)),
    )

    await expect(handleMpWebhookJob(job({ source: 'saas' }))).rejects.toThrow(
      /tenant mismatch/i,
    )
    expect(mockHandleUpgradeApproved).not.toHaveBeenCalled()
  })
})
