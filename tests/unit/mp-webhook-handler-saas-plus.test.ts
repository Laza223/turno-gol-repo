/**
 * Cobro de TurnoGol Plus, Fase B: el pago único `saas-plus:<tenantId>` (alta de
 * Plus en un anual ya pago, P7) llega como `payment` con `source=saas`.
 *
 * Antes de esta fase caía en `webhook source mismatch` (el handler solo conocía
 * `saas-upgrade:`) y el pago nunca se acreditaba. Estos tests fijan:
 *  - el chequeo de origen acepta `saas-plus:` con `source=saas` y la rechaza sin él;
 *  - el cross-check de tenant (AN5, con control positivo);
 *  - que NUNCA pasa por `onPaymentApproved` ni cancela el preapproval (AN6);
 *  - que el flag se prende después del commit y que su falla no tira el evento.
 *
 * Un pago `saas-plus:` sin `source=saas` llegado por el canal global del panel
 * lo ignora la ruta antes de encolar (`resolveSubscriptionTenant` devuelve null
 * porque no está ligado a un preapproval): acá solo se cubre lo que llega al handler.
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
vi.mock('@/modules/billing/plus.service', () => ({
  applyPlusProratePayment: vi.fn(),
  ensurePlusFlagOn: vi.fn(),
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
vi.mock('@/lib/sentry', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { onPaymentApproved } from '@/modules/billing/dunning.service'
import { applyPlusProratePayment, ensurePlusFlagOn } from '@/modules/billing/plus.service'
import { dispatchPaymentInfo } from '@/modules/payments/payment.service'
import { buildSaasPlusRef } from '@/modules/payments/payment.types'
import { captureException } from '@/lib/sentry'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockApplyPlus = applyPlusProratePayment as ReturnType<typeof vi.fn>
const mockEnableFlag = ensurePlusFlagOn as ReturnType<typeof vi.fn>
const mockOnPaymentApproved = onPaymentApproved as ReturnType<typeof vi.fn>
const mockDispatchPaymentInfo = dispatchPaymentInfo as ReturnType<typeof vi.fn>
const mockCaptureException = captureException as ReturnType<typeof vi.fn>

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PLUS_REF = buildSaasPlusRef(TENANT_ID)

function makeDbChain(mpAccessToken: string | null = null) {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([{ id: TENANT_ID, mpAccessToken }]),
    execute: () => Promise.resolve([]), // pre-check de duplicados: no visto
  }
  return chain
}

function gatewayReturning(
  externalReference: string,
  opts: { status?: string; amount?: number; preapprovalId?: string | null } = {},
) {
  return {
    getPaymentStatus: vi.fn().mockResolvedValue({
      mpPaymentId: 'mp-pay-1',
      status: opts.status ?? 'approved',
      amount: opts.amount ?? 33_750_000,
      externalReference,
      paymentMethodId: 'account_money',
      ...(opts.preapprovalId !== undefined ? { preapprovalId: opts.preapprovalId } : {}),
    }),
    cancelPreapproval: vi.fn(),
    updatePreapprovalAmount: vi.fn(),
  }
}

function job(overrides: Partial<MpWebhookJob> = {}): MpWebhookJob {
  return {
    tenantId: TENANT_ID,
    mpEventId: 'evt-1',
    eventType: 'payment',
    mpPaymentId: 'mp-pay-1',
    rawPayload: { id: 'evt-1', type: 'payment', data: { id: 'mp-pay-1' } },
    source: 'saas',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getDb.mockReturnValue(makeDbChain())
  h.withTenantContext.mockImplementation((async (
    _id: string,
    cb: (t: unknown) => Promise<unknown>,
  ) => cb({ execute: vi.fn().mockResolvedValue([]) })) as never)
  mockApplyPlus.mockResolvedValue({ enableFlag: true })
  mockEnableFlag.mockResolvedValue(undefined)
})

describe('handleMpWebhookJob — pago saas-plus:', () => {
  it('source=saas + saas-plus: ya no tira mismatch y acredita con el gateway MASTER', async () => {
    const master = gatewayReturning(PLUS_REF)
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job())

    expect(mockApplyPlus).toHaveBeenCalledTimes(1)
    const [input, gw] = mockApplyPlus.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input).toEqual({
      tenantId: TENANT_ID,
      mpPaymentId: 'mp-pay-1',
      status: 'approved',
      amountCents: 33_750_000,
    })
    expect(gw).toBe(master)
  })

  it('AN6: no pasa por onPaymentApproved ni cancela el preapproval, y no toca la seña', async () => {
    const master = gatewayReturning(PLUS_REF)
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job())

    expect(mockOnPaymentApproved).not.toHaveBeenCalled()
    expect(master.cancelPreapproval).not.toHaveBeenCalled()
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })

  it('enableFlag=true → prende el flag después; enableFlag=false → no lo toca', async () => {
    mockGetBillingGateway.mockReturnValue(gatewayReturning(PLUS_REF))

    await handleMpWebhookJob(job())
    expect(mockEnableFlag).toHaveBeenCalledWith(TENANT_ID)

    mockEnableFlag.mockClear()
    mockApplyPlus.mockResolvedValue({ enableFlag: false })
    await handleMpWebhookJob(job({ mpEventId: 'evt-2' }))
    expect(mockEnableFlag).not.toHaveBeenCalled()
  })

  it('el flag va DESPUÉS de la tx: si falla, el evento no tira (lo cura el barrido)', async () => {
    mockGetBillingGateway.mockReturnValue(gatewayReturning(PLUS_REF))
    mockEnableFlag.mockRejectedValue(new Error('db caída'))

    await expect(handleMpWebhookJob(job())).resolves.toBeUndefined()
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })

  it('un estado no aprobado también se delega (la clasificación es del service)', async () => {
    mockGetBillingGateway.mockReturnValue(gatewayReturning(PLUS_REF, { status: 'refunded' }))
    mockApplyPlus.mockResolvedValue({ enableFlag: false })

    await handleMpWebhookJob(job())

    expect(mockApplyPlus.mock.calls[0]?.[0]).toMatchObject({ status: 'refunded' })
    expect(mockEnableFlag).not.toHaveBeenCalled()
  })

  it('AN5: saas-plus: de OTRO complejo → tenant mismatch, no acredita a nadie', async () => {
    mockGetBillingGateway.mockReturnValue(gatewayReturning(buildSaasPlusRef(OTHER_TENANT_ID)))

    await expect(handleMpWebhookJob(job())).rejects.toThrow(/tenant mismatch/i)
    expect(mockApplyPlus).not.toHaveBeenCalled()
    expect(mockEnableFlag).not.toHaveBeenCalled()
  })

  it('saas-plus: SIN source=saas → source mismatch (nunca se acredita por la cuenta equivocada)', async () => {
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    const { resolveTenantGateway } = await import('@/modules/payments/mp-oauth')
    ;(resolveTenantGateway as ReturnType<typeof vi.fn>).mockReturnValue(gatewayReturning(PLUS_REF))

    await expect(handleMpWebhookJob(job({ source: undefined }))).rejects.toThrow(/source mismatch/i)
    expect(mockApplyPlus).not.toHaveBeenCalled()
  })

  it('pago desconocido (amount 0, ref vacía) con source=saas → mismatch, no prende nada', async () => {
    mockGetBillingGateway.mockReturnValue(gatewayReturning('', { status: 'pending', amount: 0 }))

    await expect(handleMpWebhookJob(job())).rejects.toThrow(/source mismatch/i)
    expect(mockApplyPlus).not.toHaveBeenCalled()
    expect(mockEnableFlag).not.toHaveBeenCalled()
  })
})

describe('handleMpWebhookJob — regresión: el cobro del débito sigue por la suscripción', () => {
  it('payment ligado a un preapproval con external_reference = tenantId → onPaymentApproved', async () => {
    mockGetBillingGateway.mockReturnValue(
      gatewayReturning(TENANT_ID, { preapprovalId: 'preapp-1', amount: 22_500_000 }),
    )

    await handleMpWebhookJob(job())

    expect(mockOnPaymentApproved).toHaveBeenCalledTimes(1)
    expect(mockApplyPlus).not.toHaveBeenCalled()
  })
})
