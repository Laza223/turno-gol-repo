import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reuso de checkout pendiente (billing.service.ts:reusablePendingCheckout):
 * `getSubscriptionState` necesita traer, además de lo que ya usaba
 * `reconcile-subscriptions.worker.ts`, el link del checkout y las condiciones
 * bajo las que MP lo cobra — son los datos contra los que se compara el pedido
 * actual antes de decidir si el preapproval pendiente sigue sirviendo.
 */

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

const PREAPPROVAL = '275616150bef48aa85d502d9b490a359'
const TENANT = 'fbeda410-39eb-4ed0-b248-2f732ad14d26'

function responder(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('MercadoPagoGateway.getSubscriptionState — reuso de checkout pendiente', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('mapea init_point SIN el &activation=true que da 404 (stripActivationFlag)', async () => {
    fetchMock.mockResolvedValue(
      responder(200, {
        id: PREAPPROVAL,
        status: 'pending',
        external_reference: TENANT,
        init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${PREAPPROVAL}&activation=true`,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 55_000 },
      }),
    )

    const state = await new MercadoPagoGateway('enc-token').getSubscriptionState(PREAPPROVAL)

    expect(state?.initPoint).toBe(
      `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${PREAPPROVAL}`,
    )
  })

  it('mapea monto (centavos) y frecuencia de auto_recurring', async () => {
    fetchMock.mockResolvedValue(
      responder(200, {
        id: PREAPPROVAL,
        status: 'pending',
        external_reference: TENANT,
        init_point: 'https://mp.test/checkout',
        auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 44_000 },
      }),
    )

    const state = await new MercadoPagoGateway('enc-token').getSubscriptionState(PREAPPROVAL)

    expect(state?.amountCents).toBe(4_400_000)
    expect(state?.frequency).toBe(12)
    expect(state?.frequencyType).toBe('months')
  })

  it('tolera auto_recurring AUSENTE: amountCents/frequency/frequencyType quedan null, no explota', async () => {
    fetchMock.mockResolvedValue(
      responder(200, {
        id: PREAPPROVAL,
        status: 'pending',
        external_reference: TENANT,
        init_point: 'https://mp.test/checkout',
      }),
    )

    const state = await new MercadoPagoGateway('enc-token').getSubscriptionState(PREAPPROVAL)

    expect(state?.amountCents).toBeNull()
    expect(state?.frequency).toBeNull()
    expect(state?.frequencyType).toBeNull()
  })

  it('sin init_point en la respuesta → null (nunca undefined ni string vacío)', async () => {
    fetchMock.mockResolvedValue(
      responder(200, {
        id: PREAPPROVAL,
        status: 'authorized',
        external_reference: TENANT,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 55_000 },
      }),
    )

    const state = await new MercadoPagoGateway('enc-token').getSubscriptionState(PREAPPROVAL)

    expect(state?.initPoint).toBeNull()
  })
})
