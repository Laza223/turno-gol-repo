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
