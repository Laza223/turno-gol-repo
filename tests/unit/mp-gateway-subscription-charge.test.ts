/**
 * El cobro mensual de una suscripción se lee de la FACTURA, no de la API de
 * pagos.
 *
 * `subscription_authorized_payment` trae en `data.id` el id del
 * `authorized_payment` —la factura del mes—, y ese id NO existe en
 * `/v1/payments`. Verificado contra producción el 2026-08-20 con el cobro real
 * de $100 de Complejo titi:
 *
 *   GET /v1/payments/7031112147          → 404
 *   GET /authorized_payments/7031112147  → 200, payment.id = 173841538187
 *
 * Con `getPaymentStatus` el job moría en 404 en cada reintento con la plata ya
 * cobrada: el complejo pagaba y la suscripción se quedaba en `trialing`.
 *
 * El payload de abajo es el REAL, recortado a los campos que se usan.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/mercadopago', () => ({ mpClient: () => ({ accessToken: 'token-master' }) }))
vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    accessToken: string
    constructor(opts: { accessToken: string }) {
      this.accessToken = opts.accessToken
    }
  },
  Payment: class {
    constructor(_: unknown) {}
  },
  PaymentRefund: class {
    constructor(_: unknown) {}
  },
  PreApproval: class {
    constructor(_: unknown) {}
  },
  Preference: class {
    constructor(_: unknown) {}
  },
}))

import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'

const FACTURA = '7031112147'
const PAGO = 173841538187
const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'
const PREAPPROVAL = '5c6294a93fe04f309344f654479e633b'

/** Respuesta real de `GET /authorized_payments/7031112147`. */
const FACTURA_REAL = {
  preapproval_id: PREAPPROVAL,
  id: Number(FACTURA),
  type: 'recurring',
  status: 'processed',
  transaction_amount: 100,
  currency_id: 'ARS',
  external_reference: TENANT,
  payment: { id: PAGO, status: 'approved', status_detail: 'accredited' },
  payment_method_id: 'account_money',
}

function responder(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('MercadoPagoGateway.getSubscriptionChargeInfo', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('pide la factura y NO la API de pagos', async () => {
    fetchMock.mockResolvedValue(responder(200, FACTURA_REAL))

    await new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA)

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/authorized_payments/${FACTURA}`)
    // La regresión exacta: pedirlo por acá devolvía 404 en producción.
    expect(url).not.toContain('/v1/payments/')
  })

  it('devuelve el id del PAGO, no el de la factura', async () => {
    fetchMock.mockResolvedValue(responder(200, FACTURA_REAL))

    const info = await new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA)

    // Es el id con el que después se rastrea la plata en MP; guardar el de la
    // factura dejaría un número que no existe en ninguna pantalla de pagos.
    expect(info.mpPaymentId).toBe(String(PAGO))
    expect(info.mpPaymentId).not.toBe(FACTURA)
  })

  it('mapea estado, monto, complejo y preapproval del cobro real', async () => {
    fetchMock.mockResolvedValue(responder(200, FACTURA_REAL))

    const info = await new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA)

    expect(info).toEqual({
      mpPaymentId: String(PAGO),
      status: 'approved',
      amount: 10_000, // $100 → centavos
      externalReference: TENANT,
      paymentMethodId: 'account_money',
      preapprovalId: PREAPPROVAL,
    })
  })

  it('el estado sale del pago de adentro, no del ciclo de facturación', async () => {
    // `status: 'processed'` en la factura describe el ciclo de cobro; el
    // resultado que importa es el del pago. Confundirlos activaría una
    // suscripción cuyo cobro fue rechazado.
    fetchMock.mockResolvedValue(
      responder(200, {
        ...FACTURA_REAL,
        status: 'processed',
        payment: { id: PAGO, status: 'rejected' },
      }),
    )

    const info = await new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA)

    expect(info.status).toBe('rejected')
  })

  it('una factura todavía sin pago queda `pending`, que es el no-op del handler', async () => {
    const { payment: _payment, ...sinPago } = FACTURA_REAL
    fetchMock.mockResolvedValue(responder(200, sinPago))

    const info = await new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA)

    expect(info.status).toBe('pending')
    expect(info.mpPaymentId).toBe('')
  })

  it('si MP no reconoce el cobro, falla fuerte en vez de inventar un aprobado', async () => {
    fetchMock.mockResolvedValue(responder(404, {}))

    await expect(
      new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA),
    ).rejects.toThrow(/no reconoce el cobro/)
  })

  it('un error de MP sube como excepción para que el job reintente', async () => {
    fetchMock.mockResolvedValue(responder(503, {}))

    await expect(
      new MercadoPagoGateway('enc-token').getSubscriptionChargeInfo(FACTURA),
    ).rejects.toThrow(/503/)
  })
})

/**
 * El cobro llega como `payment`, no como evento de suscripción.
 *
 * Historial de notificaciones de producción del 2026-08-20: las dos únicas
 * entregas del día fueron `payment.created` con el id del PAGO
 * (173841538187 y 173833098759), y ninguna de tipo suscripción — con "Planes y
 * suscripciones" tildado en el panel igual. Las dos rebotaron en 400.
 */
describe('MercadoPagoGateway.resolveSubscriptionTenant — un `payment` del canal global', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  /** Respuesta real de `GET /v1/payments/173841538187`, recortada. */
  const PAGO_DE_SUSCRIPCION = {
    id: PAGO,
    status: 'approved',
    external_reference: TENANT,
    point_of_interaction: {
      transaction_data: { subscription_id: PREAPPROVAL, billing_date: '2026-08-19' },
    },
  }

  it('resuelve el complejo siguiendo el preapproval del pago', async () => {
    fetchMock
      .mockResolvedValueOnce(responder(200, PAGO_DE_SUSCRIPCION))
      .mockResolvedValueOnce(responder(200, { id: PREAPPROVAL, external_reference: TENANT }))

    const tenant = await new MercadoPagoGateway('enc-token').resolveSubscriptionTenant(
      'payment',
      String(PAGO),
    )

    expect(tenant).toBe(TENANT)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/payments/${PAGO}`)
    // El complejo sale del preapproval y no del `external_reference` del pago:
    // una sola fuente de verdad para los dos caminos.
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`/preapproval/${PREAPPROVAL}`)
  })

  it('una venta suelta de la cuenta master no es de ningún complejo', async () => {
    // Un QR o un Point de la cuenta de TurnoGol: pago real, sin preapproval
    // detrás. Devolver un complejo acá sería aplicarle plata ajena a alguien.
    fetchMock.mockResolvedValueOnce(
      responder(200, { id: 999, status: 'approved', external_reference: 'QR #1' }),
    )

    const tenant = await new MercadoPagoGateway('enc-token').resolveSubscriptionTenant(
      'payment',
      '999',
    )

    expect(tenant).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un pago que la cuenta master no conoce se ignora', async () => {
    // La seña de una reserva vive en el MP del complejo, no en el master: acá
    // da 404, y su webhook real llega aparte con `?tenant=` en la URL.
    fetchMock.mockResolvedValueOnce(responder(404, {}))

    const tenant = await new MercadoPagoGateway('enc-token').resolveSubscriptionTenant(
      'payment',
      '123',
    )

    expect(tenant).toBeNull()
  })
})
