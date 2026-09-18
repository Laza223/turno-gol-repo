/**
 * TG-P1-MP-02: qué cuenta de MercadoPago se usa para un evento `payment`.
 *
 * Un pago de la cuenta MASTER de TurnoGol llega como `payment` — el MISMO tipo
 * que la seña de una reserva — pero lo cobró la cuenta master, no el MP del
 * complejo. El handler elegía la cuenta sólo por tipo de evento, así que
 * consultaba ese pago con el token OAuth del complejo: MP no encuentra un pago
 * de otra cuenta y el job falla. Un complejo que nunca conectó MP para señas ni
 * siquiera llegaba hasta ahí.
 *
 * El discriminador es el `&source=saas` que TurnoGol mismo pone en la
 * `notification_url` (billing.service.computeNotificationUrl), verificado
 * contra el `external_reference` real del pago. **Ese cross-check sigue
 * vigente y es lo más importante de este archivo**: quien tenga el secreto del
 * webhook no puede resolver una seña contra la cuenta master mintiendo en la
 * query, ni aplicar plata de otro complejo.
 *
 * Lo que SÍ cambió (decisión 2026-09-17, P4): el proraeo de upgrade ya no
 * existe — cambiar la cantidad de canchas nunca cobra en el medio del período,
 * así que nadie crea preferencias `saas-upgrade:` desde el deploy del precio
 * por cancha. Un pago con esa referencia sólo puede ser una preferencia vieja
 * pagada tarde: el handler no aplica nada automático (el modelo destino ni
 * siquiera es un plan) pero tampoco se lo traga en silencio — avisa para
 * conciliación manual, porque es plata que entró.
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
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { dispatchPaymentInfo, lockMpEvent } from '@/modules/payments/payment.service'
import { captureMessage } from '@/lib/sentry'
import { buildSaasUpgradeRef } from '@/modules/payments/payment.types'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockResolveTenantGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockDispatchPaymentInfo = dispatchPaymentInfo as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>
const mockCaptureMessage = captureMessage as ReturnType<typeof vi.fn>

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

function gatewayReturning(externalReference: string, status = 'approved') {
  return {
    getPaymentStatus: vi.fn().mockResolvedValue({
      mpPaymentId: 'mp-pay-1',
      status,
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
  h.withTenantContext.mockImplementation((async (
    _id: string,
    cb: (t: unknown) => Promise<unknown>,
  ) => cb({ execute: vi.fn().mockResolvedValue([]) })) as never)
  mockLockMpEvent.mockResolvedValue(true)
  mockDispatchPaymentInfo.mockResolvedValue({ alreadyProcessed: false })
})

describe('handleMpWebhookJob — elección de cuenta MP para eventos `payment`', () => {
  it('source=saas → cuenta MASTER, incluso si el complejo nunca conectó su MP', async () => {
    // La regresión concreta: sin el fix esto tiraba TenantMpNotConnectedError
    // antes de llegar a mirar el pago.
    h.getDb.mockReturnValue(makeDbChain(null))
    const master = gatewayReturning(UPGRADE_REF)
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job({ source: 'saas' }))

    expect(mockGetBillingGateway).toHaveBeenCalledTimes(1)
    expect(mockResolveTenantGateway).not.toHaveBeenCalled()
    expect(master.getPaymentStatus).toHaveBeenCalledWith('mp-pay-1')
  })

  it('sin source (seña de reserva) → sigue usando el MP del complejo', async () => {
    // Control positivo: el fix no debe desviar las señas a la cuenta master.
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    const tenantGw = gatewayReturning('booking-abc')
    mockResolveTenantGateway.mockReturnValue(tenantGw)

    await handleMpWebhookJob(job())

    expect(mockResolveTenantGateway).toHaveBeenCalledWith(TENANT_ID, 'token-del-complejo')
    expect(mockGetBillingGateway).not.toHaveBeenCalled()
  })
})

// El chequeo de seguridad, intacto: `source=saas` y el `external_reference`
// real del pago tienen que contar la MISMA historia. No alcanza con confiar en
// la query — quien tenga el secreto del webhook la controla.
describe('handleMpWebhookJob — cross-check source ↔ external_reference', () => {
  it('source=saas sobre una seña → corta, no aplica plata por la rama equivocada', async () => {
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    mockGetBillingGateway.mockReturnValue(gatewayReturning('booking-abc'))

    await expect(handleMpWebhookJob(job({ source: 'saas' }))).rejects.toThrow(/source mismatch/i)
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })

  it('referencia de la cuenta master sin source → corta en vez de seguir con la cuenta equivocada', async () => {
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    mockResolveTenantGateway.mockReturnValue(gatewayReturning(UPGRADE_REF))

    await expect(handleMpWebhookJob(job())).rejects.toThrow(/source mismatch/i)
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })

  it('el cross-check de tenant sigue vivo: ref de OTRO complejo → corta', async () => {
    // Sin esto, quien tenga MP_WEBHOOK_SECRET podría encolar un job declarando
    // un tenant y traer el pago de otro.
    h.getDb.mockReturnValue(makeDbChain(null))
    mockGetBillingGateway.mockReturnValue(
      gatewayReturning(buildSaasUpgradeRef('tenant-ajeno', TARGET_PLAN_ID)),
    )

    await expect(handleMpWebhookJob(job({ source: 'saas' }))).rejects.toThrow(/tenant mismatch/i)
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })
})

// Precio por cancha (P4): el proraeo ya no existe. Nadie crea preferencias
// `saas-upgrade:` desde ese deploy, así que un pago con esa referencia es una
// preferencia vieja pagada tarde.
describe('handleMpWebhookJob — pago de proraeo, un camino que ya no existe', () => {
  it('approved: no aplica nada y avisa para conciliación manual (es plata que entró)', async () => {
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    mockGetBillingGateway.mockReturnValue(gatewayReturning(UPGRADE_REF, 'approved'))

    await handleMpWebhookJob(job({ source: 'saas' }))

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [message, opts] = mockCaptureMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toMatch(/conciliacion manual/i)
    expect(opts).toMatchObject({
      level: 'warning',
      extra: expect.objectContaining({
        tenantId: TENANT_ID,
        externalReference: UPGRADE_REF,
        mpPaymentId: 'mp-pay-1',
      }),
    })
    // Y sobre todo: no cae a la rama de seña con una referencia que no es un
    // booking.
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })

  it('rechazado: ni siquiera avisa — no entró plata, no hay nada que conciliar', async () => {
    h.getDb.mockReturnValue(makeDbChain('token-del-complejo'))
    mockGetBillingGateway.mockReturnValue(gatewayReturning(UPGRADE_REF, 'rejected'))

    await handleMpWebhookJob(job({ source: 'saas' }))

    expect(mockCaptureMessage).not.toHaveBeenCalled()
    expect(mockDispatchPaymentInfo).not.toHaveBeenCalled()
  })
})
