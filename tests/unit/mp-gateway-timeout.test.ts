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
      // id 999 simula un cobro recurrente de suscripción (subscription_authorized_payment):
      // MP lo liga a su preapproval de origen vía `point_of_interaction.transaction_data
      // .subscription_id` (Fix 2b; shape verificado contra el pago real 167921223525 del
      // ensayo). Cualquier otro id simula un pago de booking-deposit normal, sin ese campo.
      const { id } = args as { id: string }
      return Promise.resolve(
        id === '999'
          ? {
              id: 999,
              status: 'approved',
              transaction_amount: 55_000,
              external_reference: 'tenant-x',
              payment_method_id: 'account_money',
              point_of_interaction: {
                type: 'SUBSCRIPTIONS',
                transaction_data: { subscription_id: 'mp-preapp-live-1' },
              },
            }
          : {
              id: 123,
              status: 'approved',
              transaction_amount: 1000,
              external_reference: 'ref-1',
              payment_method_id: 'visa',
            },
      )
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

// Fix 2b (billing R2 🔴): `subscription_authorized_payment` charges necesitan
// el preapproval de origen para que `onPaymentApproved` (dunning.service.ts)
// pueda verificar que matchea la suscripción vigente antes de reactivar. MP
// lo trae en `point_of_interaction.transaction_data.subscription_id`
// (verificado contra el pago real 167921223525: subscription_id = el
// preapproval e00ea2c8… que canceló K5; `linked_to` NO existe en el payload
// real). Sin ese campo (pagos de booking-deposit normales, sin preapproval
// detrás), `preapprovalId` queda `undefined` (no `null`): la ausencia de dato
// NO debe leerse como "confirmé que no matchea" (ver `preapprovalIdMatches`
// en dunning.service.ts).
describe('MercadoPagoGateway.getPaymentStatus — preapprovalId (Fix 2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('expone point_of_interaction.transaction_data.subscription_id como preapprovalId cuando MP lo trae', async () => {
    const gw = new MercadoPagoGateway('enc-token')
    const res = await gw.getPaymentStatus('999')
    expect(res.preapprovalId).toBe('mp-preapp-live-1')
  })

  it('sin point_of_interaction (pago normal de booking) → preapprovalId undefined, no null', async () => {
    const gw = new MercadoPagoGateway('enc-token')
    const res = await gw.getPaymentStatus('123')
    expect(res.preapprovalId).toBeUndefined()
  })
})
