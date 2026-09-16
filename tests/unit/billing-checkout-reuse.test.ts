import { beforeEach, describe, expect, it, vi } from 'vitest'

// Contexto real (producción, 2026-09-16): el dueño tocó "Reactivar plan" 5
// veces sin terminar de pagar. `reactivate()` (y `subscribe()`) cancelaban el
// preapproval anterior en MP y creaban uno nuevo EN CADA intento, así que MP
// le mandó a él y a la cuenta pagadora un mail "se canceló tu suscripción" por
// cada uno. Fix: si el preapproval que ya existe sigue `pending` en MP, es del
// mismo tenant, y el monto/frecuencia coinciden EXACTO con el pedido actual,
// se reusa su `init_point` en vez de cancelar + crear
// (`reusablePendingCheckout`, billing.service.ts).

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { reactivate, subscribe } from '@/modules/billing/billing.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const PLAN_ID = 'plan-1'
const OLD_PREAPPROVAL = 'mp-pending-1'

const planRow = {
  id: PLAN_ID,
  slug: 'predio',
  name: 'Predio',
  max_courts: 2,
  price_monthly: 5_500_000,
  price_annual: 4_400_000,
}

const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: 'marcelo@x.com' }

function makeSubscribeSubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'trialing',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: OLD_PREAPPROVAL,
    mp_payer_email: null,
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

/**
 * tx.execute order dentro de `subscribe()`: 1) loadSubForUpdate, 2) loadPlan,
 * 3) countOnlineCourts, 4) loadTenantOwner, 5) UPDATE — mismo orden gane o no
 * gane el reuso (el reuso y el camino viejo escriben un solo UPDATE cada uno).
 */
function makeSubscribeTx(subRow: ReturnType<typeof makeSubscribeSubRow>): DbTx {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow])
    .mockResolvedValueOnce([planRow])
    .mockResolvedValueOnce([{ n: 0 }])
    .mockResolvedValueOnce([ownerRow])
    .mockResolvedValueOnce([])
  return { execute } as unknown as DbTx
}

/**
 * tx.execute order dentro de `reactivate()`: 1) loadSubForUpdate, 2) loadPlan,
 * 3) loadTenantOwner, 4) UPDATE. No hay guard de cupo de plan acá.
 */
function makeReactivateTx(subRow: ReturnType<typeof makeSubscribeSubRow>): DbTx {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow])
    .mockResolvedValueOnce([planRow])
    .mockResolvedValueOnce([ownerRow])
    .mockResolvedValueOnce([])
  return { execute } as unknown as DbTx
}

function pendingState(over: Partial<GatewaySubscriptionState> = {}): GatewaySubscriptionState {
  return {
    preapprovalId: OLD_PREAPPROVAL,
    status: 'pending',
    externalReference: TENANT_ID,
    nextPaymentDate: null,
    chargedQuantity: 0,
    lastChargedDate: null,
    lastChargedAmountCents: null,
    initPoint: 'https://mp.test/preapproval/old-pending',
    amountCents: planRow.price_monthly,
    frequency: 1,
    frequencyType: 'months',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribe — reusa el checkout pendiente en vez de cancelar + crear', () => {
  it('preapproval pending, mismo tenant, monto y frecuencia exactos → reusa: mismo checkoutUrl/preapprovalId, sin tocar MP', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState()

    const result = await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(result).toEqual({
      checkoutUrl: 'https://mp.test/preapproval/old-pending',
      preapprovalId: OLD_PREAPPROVAL,
    })
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'subscription.checkout_reused',
        metadata: expect.objectContaining({
          planId: PLAN_ID,
          billingCycle: 'monthly',
          mpSubscriptionId: OLD_PREAPPROVAL,
        }),
      }),
    )
  })

  it('pide un ciclo distinto (mensual pendiente, pide anual) → NO reusa: cancela y crea uno nuevo', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState() // pending mensual

    await subscribe(TENANT_ID, PLAN_ID, 'annual', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('el monto no coincide (otro plan, o el precio cambió desde el intento anterior) → NO reusa', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ amountCents: planRow.price_monthly - 1 })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('MP dice `authorized` (ya no está pending) → NO reusa', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ status: 'authorized' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('MP dice `cancelled` → NO reusa', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ status: 'cancelled' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('getSubscriptionState tira error (MP caído) → no propaga, sigue el camino de siempre y termina OK', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.getSubscriptionState = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    const result = await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(result.preapprovalId).toBeTruthy()
    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })
})

describe('reactivate — mismo reuso de checkout pendiente que subscribe', () => {
  it('preapproval pending, mismo tenant, monto y frecuencia exactos → reusa: mismo checkoutUrl/preapprovalId, sin tocar MP', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }))
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState()

    const result = await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(result).toEqual({
      checkoutUrl: 'https://mp.test/preapproval/old-pending',
      preapprovalId: OLD_PREAPPROVAL,
    })
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'subscription.checkout_reused',
        metadata: expect.objectContaining({
          planId: PLAN_ID,
          billingCycle: 'monthly',
          mpSubscriptionId: OLD_PREAPPROVAL,
        }),
      }),
    )
  })

  it('pide un ciclo distinto → NO reusa: cancela y crea uno nuevo', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }))
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState() // pending mensual

    await reactivate(TENANT_ID, PLAN_ID, 'annual', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('getSubscriptionState tira error → no propaga, sigue el camino de siempre y termina OK', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }))
    const gateway = new MockGateway()
    gateway.getSubscriptionState = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    const result = await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(result.preapprovalId).toBeTruthy()
    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })
})
