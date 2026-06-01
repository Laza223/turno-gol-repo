import { beforeEach, describe, expect, it, vi } from 'vitest'

// getPaymentStatus() sits on the deposit-confirmation polling path. The SDK
// client carries an 8s default, but a per-call timeout makes the bound explicit
// and survives any future change to the client default — so we assert the call
// shape, not the client config.
const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))

vi.mock('@/lib/mercadopago', () => ({ mpClient: () => ({ __mock: 'config' }) }))

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {
    constructor(_: unknown) {}
  },
  Payment: class {
    constructor(_: unknown) {}
    get(args: unknown): Promise<unknown> {
      getSpy(args)
      return Promise.resolve({
        id: 123,
        status: 'approved',
        transaction_amount: 1000,
        external_reference: 'ref-1',
        payment_method_id: 'visa',
      })
    }
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

import { MercadoPagoGateway, MP_GET_TIMEOUT_MS } from '@/modules/payments/mp-gateway.implementation'

describe('MercadoPagoGateway.getPaymentStatus timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes an explicit 8s requestOptions.timeout (not the SDK default)', async () => {
    const gw = new MercadoPagoGateway('enc-token')
    await gw.getPaymentStatus('123')
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith({
      id: '123',
      requestOptions: { timeout: MP_GET_TIMEOUT_MS },
    })
    expect(MP_GET_TIMEOUT_MS).toBe(8000)
  })

  it('still maps the payment payload correctly', async () => {
    const gw = new MercadoPagoGateway('enc-token')
    const res = await gw.getPaymentStatus('123')
    expect(res).toEqual({
      mpPaymentId: '123',
      status: 'approved',
      amount: 100_000,
      externalReference: 'ref-1',
      paymentMethodId: 'visa',
    })
  })
})
