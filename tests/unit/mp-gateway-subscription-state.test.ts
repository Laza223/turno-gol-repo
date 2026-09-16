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
        reason: 'TurnoGol — Predio (anual)',
        auto_recurring: {
          frequency: 12,
          frequency_type: 'months',
          transaction_amount: 44_000,
          start_date: '2027-03-01T00:00:00.000Z',
        },
      }),
    )

    const state = await new MercadoPagoGateway('enc-token').getSubscriptionState(PREAPPROVAL)

    expect(state?.amountCents).toBe(4_400_000)
    expect(state?.frequency).toBe(12)
    expect(state?.frequencyType).toBe('months')
    // `reason` y `start_date` son los que usa el reuso de checkout para no
    // confundir dos planes del mismo precio ni cobrar durante el trial.
    expect(state?.reason).toBe('TurnoGol — Predio (anual)')
    expect(state?.startDate?.toISOString()).toBe('2027-03-01T00:00:00.000Z')
  })

  it('respuesta real de producción (2026-09-16): summarized en null y start_date completado por MP', async () => {
    fetchMock.mockResolvedValue(
      responder(200, {
        id: PREAPPROVAL,
        status: 'pending',
        external_reference: TENANT,
        reason: 'TurnoGol — Predio (reactivación)',
        init_point: `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${PREAPPROVAL}&activation=true`,
        date_created: '2026-09-16T17:38:00.000-04:00',
        auto_recurring: {
          frequency: 12,
          frequency_type: 'months',
          transaction_amount: 604800,
          currency_id: 'ARS',
          start_date: '2026-09-16T17:38:00.000-04:00',
          has_billing_day: false,
          free_trial: null,
        },
        summarized: {
          quotas: null,
          charged_quantity: null,
          pending_charge_quantity: null,
          charged_amount: null,
          pending_charge_amount: null,
          semaphore: null,
          last_charged_date: null,
          last_charged_amount: null,
        },
      }),
    )

    const state = await new MercadoPagoGateway('enc-token').getSubscriptionState(PREAPPROVAL)

    expect(state?.status).toBe('pending')
    expect(state?.chargedQuantity).toBe(0)
    expect(state?.amountCents).toBe(60_480_000)
    expect(state?.startDate?.toISOString()).toBe('2026-09-16T21:38:00.000Z')
    expect(state?.initPoint).not.toContain('activation=true')
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
    expect(state?.startDate).toBeNull()
    expect(state?.reason).toBeNull()
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
