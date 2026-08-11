import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix B5 (🔴 huérfano MP↔DB, misma familia que B1/B4): `subscribe()` leía la
// suscripción SIN lock (`loadSub`) y, a diferencia de `reactivate()`, NUNCA
// cancelaba un `mp_subscription_id` previo antes de pedir un preapproval
// nuevo. Dos subscribe concurrentes sobre el mismo tenant (doble click, o un
// re-subscribe durante el trial) crean CADA UNO un preapproval en MP; el
// UPDATE local solo guarda el último id — el otro preapproval queda
// huérfano en MP, cobrando sin que nada en la DB lo referencie. El fix
// cambia `loadSub` por `loadSubForUpdate` (mismo patrón `FOR UPDATE` que
// `support.service.ts:loadSubForUpdate`, serializa concurrentes) y agrega el
// mismo bloque cancel-old que ya tenía `reactivate()`.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { subscribe } from '@/modules/billing/billing.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { MpGatewayError } from '@/modules/payments/payment.errors'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const PLAN_ID = 'plan-1'

function makeSubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'trialing',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: null,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
    ...overrides,
  }
}

const planRow = {
  id: PLAN_ID,
  slug: 'predio',
  name: 'Predio',
  max_courts: 2,
  price_monthly: 5_500_000,
  price_annual: 4_400_000,
}

const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: 'marcelo@x.com' }

/**
 * tx.execute order dentro de `subscribe()`: 1) loadSubForUpdate, 2) loadPlan,
 * 3) loadTenantOwner, 4) el UPDATE final. `insertSystemAuditLog` está
 * mockeado a nivel de módulo (arriba) y no pasa por `tx.execute`.
 */
function makeTx(subRow: ReturnType<typeof makeSubRow>) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSubForUpdate
    .mockResolvedValueOnce([planRow]) // loadPlan
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
    .mockResolvedValueOnce([]) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribe — cancela el preapproval viejo antes de crear el nuevo (Fix B5 🔴)', () => {
  it('con mp_subscription_id previo: cancela el viejo ANTES de crear el nuevo', async () => {
    const tx = makeTx(makeSubRow({ mp_subscription_id: 'mp-old-1' }))
    const gateway = new MockGateway()

    // Trackea el ORDEN real de las llamadas al gateway, no solo el resultado
    // final — así el test detecta si el cancel llega tarde (después del
    // create) y no solo si llega.
    const order: string[] = []
    const originalCancel = gateway.cancelPreapproval.bind(gateway)
    gateway.cancelPreapproval = async (id: string) => {
      order.push('cancel')
      return originalCancel(id)
    }
    const originalCreate = gateway.createPreapproval.bind(gateway)
    gateway.createPreapproval = async (input) => {
      order.push('create')
      return originalCreate(input)
    }

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual(['mp-old-1'])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(order).toEqual(['cancel', 'create'])
  })

  it('sin mp_subscription_id previo (primer subscribe, nada que cancelar): no llama a cancelPreapproval', async () => {
    const tx = makeTx(makeSubRow({ mp_subscription_id: null }))
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('si cancelar el viejo devuelve "ya estaba cancelado en MP", tolera y sigue creando el nuevo', async () => {
    const tx = makeTx(makeSubRow({ mp_subscription_id: 'mp-old-1' }))
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = new MpGatewayError(
      'Failed to cancel MP preapproval mp-old-1',
      {
        message: 'You can not modify a cancelled preapproval.',
        status: 400,
      },
    )

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual(['mp-old-1'])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })
})
