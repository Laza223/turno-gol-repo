/**
 * De dónde saca el handler los datos de un cobro de suscripción.
 *
 * `subscription_authorized_payment` trae en `data.id` el id de la FACTURA del
 * mes (`authorized_payment`), no el del pago. El handler lo mandaba a
 * `getPaymentStatus`, o sea a `/v1/payments/<id de factura>`, que en MP no
 * existe: verificado en producción el 2026-08-20, ese GET devuelve 404 con el
 * cobro de $100 ya cobrado. El job fallaba en cada reintento y la suscripción
 * se quedaba en `trialing` para siempre.
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
vi.mock('@/modules/payments/mp-oauth', () => ({ resolveTenantGateway: vi.fn() }))
vi.mock('@/modules/payments/payment.service', () => ({
  dispatchPaymentInfo: vi.fn().mockResolvedValue({ alreadyProcessed: false }),
  lockMpEvent: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/modules/billing/dunning.service', () => ({
  onPaymentApproved: vi.fn().mockResolvedValue({ alreadyProcessed: false }),
  onPaymentRejected: vi.fn().mockResolvedValue({ alreadyProcessed: false }),
}))
vi.mock('@/modules/billing/billing.service', () => ({ handleUpgradeApproved: vi.fn() }))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: vi.fn() }))
vi.mock('@/modules/notifications/notification.service', () => ({ dispatchEmail: vi.fn() }))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminBookingConfirmed: vi.fn() }))
vi.mock('@/shared/observability', () => ({ track: { webhook: vi.fn(), payment: vi.fn() } }))

import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { onPaymentApproved, onPaymentRejected } from '@/modules/billing/dunning.service'
import { lockMpEvent } from '@/modules/payments/payment.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

const mockGetBillingGateway = getBillingGateway as ReturnType<typeof vi.fn>
const mockResolveTenantGateway = resolveTenantGateway as ReturnType<typeof vi.fn>
const mockOnPaymentApproved = onPaymentApproved as ReturnType<typeof vi.fn>
const mockOnPaymentRejected = onPaymentRejected as ReturnType<typeof vi.fn>
const mockLockMpEvent = lockMpEvent as ReturnType<typeof vi.fn>

// Ids reales del cobro de producción del 2026-08-20.
const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'
const FACTURA = '7031112147'
const PAGO = '173841538187'
const PREAPPROVAL = '5c6294a93fe04f309344f654479e633b'

function gatewayMaster(status = 'approved') {
  return {
    getPaymentStatus: vi.fn().mockRejectedValue(new Error('MP 404: no existe ese pago')),
    getSubscriptionChargeInfo: vi.fn().mockResolvedValue({
      mpPaymentId: PAGO,
      status,
      amount: 10_000,
      externalReference: TENANT,
      paymentMethodId: 'account_money',
      preapprovalId: PREAPPROVAL,
    }),
  }
}

function job(): MpWebhookJob {
  return {
    tenantId: TENANT,
    mpEventId: 'evt-1',
    eventType: 'subscription_authorized_payment',
    mpPaymentId: FACTURA,
    rawPayload: { id: 'evt-1', type: 'subscription_authorized_payment', data: { id: FACTURA } },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([{ id: TENANT, mpAccessToken: null }]),
    execute: () => Promise.resolve([]),
  }
  h.getDb.mockReturnValue(chain)
  h.withTenantContext.mockImplementation((async (
    _id: string,
    cb: (t: unknown) => Promise<unknown>,
  ) => cb({ execute: vi.fn().mockResolvedValue([]) })) as never)
})

describe('handleMpWebhookJob — cobro de suscripción', () => {
  it('lee la factura del mes y NO la API de pagos', async () => {
    const master = gatewayMaster()
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job())

    expect(master.getSubscriptionChargeInfo).toHaveBeenCalledWith(FACTURA)
    // El mock de `getPaymentStatus` rechaza a propósito: si el handler
    // volviera a ese camino, este test explota en vez de pasar en silencio.
    expect(master.getPaymentStatus).not.toHaveBeenCalled()
  })

  it('le pasa a la activación el id del PAGO y el preapproval de origen', async () => {
    const master = gatewayMaster()
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job())

    expect(mockOnPaymentApproved).toHaveBeenCalledTimes(1)
    const args = mockOnPaymentApproved.mock.calls[0] as unknown[]
    // Posiciones 6 y 7: mpPaymentId y preapprovalId (ver el handler).
    expect(args[6]).toBe(PAGO)
    expect(args[6]).not.toBe(FACTURA)
    expect(args[7]).toBe(PREAPPROVAL)
  })

  it('un cobro rechazado entra a dunning y no activa nada', async () => {
    const master = gatewayMaster('rejected')
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job())

    expect(mockOnPaymentRejected).toHaveBeenCalledTimes(1)
    expect(mockOnPaymentApproved).not.toHaveBeenCalled()
  })

  it('siempre por la cuenta MASTER, aunque el complejo nunca haya conectado su MP', async () => {
    // La suscripción se cobra a la cuenta de TurnoGol, no a la del complejo:
    // pedirle el cobro al MP del complejo no encontraría nada.
    const master = gatewayMaster()
    mockGetBillingGateway.mockReturnValue(master)

    await handleMpWebhookJob(job())

    expect(mockGetBillingGateway).toHaveBeenCalledTimes(1)
    expect(mockResolveTenantGateway).not.toHaveBeenCalled()
  })

  it('rechaza el cobro si el complejo del evento no es el del preapproval', async () => {
    const master = gatewayMaster()
    master.getSubscriptionChargeInfo.mockResolvedValue({
      mpPaymentId: PAGO,
      status: 'approved',
      amount: 10_000,
      externalReference: 'otro-complejo',
      paymentMethodId: 'account_money',
      preapprovalId: PREAPPROVAL,
    })
    mockGetBillingGateway.mockReturnValue(master)

    // El cross-check sigue en pie con la fuente nueva: quien tenga el secreto
    // del webhook no puede aplicarle el cobro de un complejo a otro.
    await expect(handleMpWebhookJob(job())).rejects.toThrow(/tenant mismatch/)
    expect(mockOnPaymentApproved).not.toHaveBeenCalled()
  })
})

/**
 * El mismo cobro, pero llegando como `payment` — que es como MercadoPago lo
 * manda de verdad (historial de notificaciones del 2026-08-20).
 */
describe('handleMpWebhookJob — el cobro que llega como `payment`', () => {
  function jobPayment(): MpWebhookJob {
    return {
      tenantId: TENANT,
      mpEventId: 'evt-pay-1',
      eventType: 'payment',
      mpPaymentId: PAGO,
      rawPayload: { id: 'evt-pay-1', type: 'payment', data: { id: PAGO } },
      // Lo pone el route cuando el complejo lo resolvió MercadoPago con el
      // token master.
      source: 'saas',
    }
  }

  function master(info: Record<string, unknown>) {
    return { getPaymentStatus: vi.fn().mockResolvedValue(info) }
  }

  const COBRO = {
    mpPaymentId: PAGO,
    status: 'approved',
    amount: 10_000,
    externalReference: TENANT,
    paymentMethodId: 'account_money',
    preapprovalId: PREAPPROVAL,
  }

  it('un `payment` ligado a un preapproval activa la suscripción', async () => {
    const gw = master(COBRO)
    mockGetBillingGateway.mockReturnValue(gw)

    await handleMpWebhookJob(jobPayment())

    expect(mockOnPaymentApproved).toHaveBeenCalledTimes(1)
    const args = mockOnPaymentApproved.mock.calls[0] as unknown[]
    expect(args[6]).toBe(PAGO)
    expect(args[7]).toBe(PREAPPROVAL)
  })

  it('no lockea el evento por su cuenta: lo hace la activación', async () => {
    // `onPaymentApproved` hace su propio `lockWebhook`. Si el handler lockeara
    // antes, la primera entrega quedaría marcada como procesada SIN haber
    // aplicado el cobro, y ningún reintento lo arreglaría.
    const gw = master(COBRO)
    mockGetBillingGateway.mockReturnValue(gw)

    await handleMpWebhookJob(jobPayment())

    expect(mockLockMpEvent).not.toHaveBeenCalled()
  })

  it('un `payment` sin preapproval sigue el camino de siempre', async () => {
    // Control positivo: una seña de reserva o el proraeo de un upgrade no
    // deben desviarse a la rama de suscripción.
    const gw = master({ ...COBRO, preapprovalId: undefined, externalReference: 'booking-abc' })
    mockGetBillingGateway.mockReturnValue(gw)

    // Sin `upgrade` en el ref y con source=saas, el handler corta por el
    // control de coherencia que ya existía — lo que importa acá es que NO
    // haya entrado a la rama de suscripción.
    await expect(handleMpWebhookJob(jobPayment())).rejects.toThrow(/source mismatch/)
    expect(mockOnPaymentApproved).not.toHaveBeenCalled()
  })

  it('rechaza el cobro si el complejo del pago no es el reclamado', async () => {
    const gw = master({ ...COBRO, externalReference: 'otro-complejo' })
    mockGetBillingGateway.mockReturnValue(gw)

    await expect(handleMpWebhookJob(jobPayment())).rejects.toThrow(/tenant mismatch/)
    expect(mockOnPaymentApproved).not.toHaveBeenCalled()
  })
})
