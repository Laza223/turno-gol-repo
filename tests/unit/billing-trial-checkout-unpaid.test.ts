import { describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { isTrialCheckoutUnpaid } from '@/modules/billing/billing.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'

// Tener un preapproval guardado no es tener la tarjeta cargada. Caso real (El
// Vagón, prod 2026-09-27): "Activar plan" creó el preapproval, el dueño nunca
// pagó el checkout, y la pantalla lo trataba como suscripto — sin botón para
// pagar. El estado de abajo es el que devuelve MP para ese preapproval.

const TENANT = 'ed346072-07a4-41d0-b5a4-2741853fe921'
const PREAPPROVAL = 'a81bc5340b074b498515b7b573294620'

function state(overrides: Partial<GatewaySubscriptionState>): GatewaySubscriptionState {
  return {
    preapprovalId: PREAPPROVAL,
    status: 'pending',
    externalReference: TENANT,
    nextPaymentDate: new Date('2026-09-07T23:25:35.000Z'),
    chargedQuantity: 0,
    lastChargedDate: null,
    lastChargedAmountCents: null,
    ...overrides,
  }
}

function gatewayWith(s: GatewaySubscriptionState | null): MockGateway {
  const gw = new MockGateway()
  gw.subscriptionState = s
  return gw
}

describe('isTrialCheckoutUnpaid', () => {
  it('checkout pending sin cobros del mismo complejo → no hay débito, se puede activar', async () => {
    expect(await isTrialCheckoutUnpaid(TENANT, PREAPPROVAL, gatewayWith(state({})))).toBe(true)
  })

  it('checkout que MP ya canceló → tampoco hay débito', async () => {
    const gw = gatewayWith(state({ status: 'cancelled' }))
    expect(await isTrialCheckoutUnpaid(TENANT, PREAPPROVAL, gw)).toBe(true)
  })

  it('débito autorizado (tarjeta cargada) → es un débito vivo', async () => {
    const gw = gatewayWith(state({ status: 'authorized' }))
    expect(await isTrialCheckoutUnpaid(TENANT, PREAPPROVAL, gw)).toBe(false)
  })

  it('preapproval de otro complejo → no se toca nada', async () => {
    const gw = gatewayWith(state({ externalReference: 'otro-tenant' }))
    expect(await isTrialCheckoutUnpaid(TENANT, PREAPPROVAL, gw)).toBe(false)
  })

  it('MP no reconoce el id → la pantalla se queda como estaba', async () => {
    expect(await isTrialCheckoutUnpaid(TENANT, PREAPPROVAL, gatewayWith(null))).toBe(false)
  })

  it('MP no responde → la pantalla se queda como estaba (no ofrece un segundo checkout)', async () => {
    const gw = new MockGateway()
    gw.getSubscriptionState = async () => {
      throw new Error('timeout')
    }
    expect(await isTrialCheckoutUnpaid(TENANT, PREAPPROVAL, gw)).toBe(false)
  })
})
