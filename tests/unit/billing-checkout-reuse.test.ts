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
// El preapproval no lleva `plan_id`: el `reason` es el único vínculo con el
// plan, y es lo que el pagador ve en la pantalla de MP.
const REASON_MENSUAL = 'TurnoGol — Predio (mensual)'
const REASON_REACTIVACION = 'TurnoGol — Predio (reactivación)'

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
    reason: REASON_MENSUAL,
    // Realista: MP completa `start_date` con la fecha de creación aunque no se
    // le mande (medido en producción el 2026-09-16). Un fixture con `null`
    // escondió que el reuso no se daba nunca.
    startDate: new Date('2026-01-01T00:00:00Z'),
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

  it('el `reason` es de otro plan (dos planes podrían costar lo mismo) → NO reusa', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: 'TurnoGol — Complejo (mensual)' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('el preapproval es de OTRO tenant → NO reusa (aislamiento)', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ externalReference: 'tenant-ajeno' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('el pendiente ya cobró algo (chargedQuantity > 0) → NO reusa', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow())
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ chargedQuantity: 1 })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('el pendiente tiene un start_date viejo y el trial se extendió después → NO reusa: cobrarían durante la prueba', async () => {
    // Soporte corrió `extendTrial` después del intento anterior, así que el
    // preapproval pendiente arrastra la fecha vieja de primer cobro.
    const trialEndsAt = new Date('2027-03-01T00:00:00Z')
    const execute = vi
      .fn()
      .mockResolvedValueOnce([makeSubscribeSubRow()])
      .mockResolvedValueOnce([planRow])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ ...ownerRow, trialEndsAt }])
      .mockResolvedValueOnce([])
    const tx = { execute } as unknown as DbTx
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ startDate: new Date('2027-02-01T00:00:00Z') })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx, new Date('2027-01-15T00:00:00Z'))

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]!.firstChargeAt?.toISOString()).toBe(
      trialEndsAt.toISOString(),
    )
  })

  it('el start_date del pendiente sigue siendo el fin del trial de hoy → SÍ reusa', async () => {
    const trialEndsAt = new Date('2027-03-01T00:00:00Z')
    const execute = vi
      .fn()
      .mockResolvedValueOnce([makeSubscribeSubRow()])
      .mockResolvedValueOnce([planRow])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ ...ownerRow, trialEndsAt }])
      .mockResolvedValueOnce([])
    const tx = { execute } as unknown as DbTx
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ startDate: trialEndsAt })

    const result = await subscribe(
      TENANT_ID,
      PLAN_ID,
      'monthly',
      gateway,
      tx,
      new Date('2027-01-15T00:00:00Z'),
    )

    expect(result.preapprovalId).toBe(OLD_PREAPPROVAL)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(0)
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
  it('caso real de producción: MP devolvió start_date = fecha de creación (sin que se lo mandáramos) → SÍ reusa', async () => {
    // Respuesta real de GET /preapproval del 2026-09-16, recortada: pending,
    // 12/months, 604800 ARS, start_date = date_created, summarized todo en null.
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }))
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({
      reason: REASON_REACTIVACION,
      amountCents: planRow.price_annual * 12,
      frequency: 12,
      startDate: new Date('2026-09-16T17:38:00.000-04:00'),
      chargedQuantity: 0,
    })

    const result = await reactivate(
      TENANT_ID,
      PLAN_ID,
      'annual',
      gateway,
      tx,
      new Date('2026-09-16T21:39:30Z'),
    )

    expect(result.preapprovalId).toBe(OLD_PREAPPROVAL)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })

  it('el pendiente tiene un primer cobro FUTURO pero reactivar cobra ya → NO reusa', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }))
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({
      reason: REASON_REACTIVACION,
      startDate: new Date('2026-10-01T00:00:00Z'),
    })

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx, new Date('2026-09-16T21:39:30Z'))

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('preapproval pending, mismo tenant, monto y frecuencia exactos → reusa: mismo checkoutUrl/preapprovalId, sin tocar MP', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }))
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: REASON_REACTIVACION })

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
    gateway.subscriptionState = pendingState({ reason: REASON_REACTIVACION }) // pending mensual

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
