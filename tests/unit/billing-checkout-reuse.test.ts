import { beforeEach, describe, expect, it, vi } from 'vitest'

// Contexto real (producción, 2026-09-16): el dueño tocó "Reactivar plan" 5
// veces sin terminar de pagar (mensual/anual). `reactivate()` (y `subscribe()`)
// cancelaban el preapproval anterior en MP y creaban uno nuevo EN CADA
// intento, así que MP le mandó a él y a la cuenta pagadora un mail "se
// canceló tu suscripción" por cada uno. Dos fixes:
//   1) si el preapproval que ya existe sigue `pending` en MP, es del mismo
//      tenant, y el monto/frecuencia coinciden EXACTO con el pedido actual,
//      se reusa su `init_point` en vez de cancelar + crear
//      (`reusablePendingCheckout`, billing.service.ts).
//   2) si NO coincide (ej. cambió de ciclo), pero el preapproval sigue
//      `pending`, es de este tenant y nunca cobró, tampoco se cancela —
//      cancelar algo que nunca se pagó dispara el mismo mail sin que haya
//      pasado nada. Se deja vivo y se registra `leftPendingMpSubscriptionId`
//      en el audit (`isPendingNeverCharged`, billing.service.ts).

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
 * tx.execute order dentro de `subscribe()` — Fix D4-A1 (hallazgo 🟢10, auditoría
 * 2026-09-16): la primera lectura (`loadSub`) ahora es SIN lock, así que la
 * cantidad de llamadas depende de si el reuso gana o no:
 * - Gana (`reused: true`, default): 1) loadSub, 2) loadPlan,
 *   3) countOnlineCourts, 4) loadTenantOwner, 5) el UPDATE con CAS del reuso
 *   (devuelve una fila: el `mp_subscription_id` no cambió desde la lectura 1).
 * - No gana (`reused: false`): mismos 1-4, más 5) loadSubForUpdate (recién acá
 *   se pide el lock real) y 6) el UPDATE final de cancelar+crear.
 */
function makeSubscribeTx(
  subRow: ReturnType<typeof makeSubscribeSubRow>,
  opts: { reused?: boolean; lockedSubRow?: ReturnType<typeof makeSubscribeSubRow> } = {},
): DbTx {
  const { reused = true, lockedSubRow = subRow } = opts
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow])
    .mockResolvedValueOnce([planRow])
    .mockResolvedValueOnce([{ n: 0 }])
    .mockResolvedValueOnce([ownerRow])
  if (reused) {
    execute.mockResolvedValueOnce([{ tenant_id: TENANT_ID }])
  } else {
    execute.mockResolvedValueOnce([lockedSubRow]).mockResolvedValueOnce([])
  }
  return { execute } as unknown as DbTx
}

/**
 * tx.execute order dentro de `reactivate()` — mismo criterio que
 * `makeSubscribeTx` (no hay guard de cupo de plan acá, así que un llamado menos):
 * - Gana: 1) loadSub, 2) loadPlan, 3) loadTenantOwner, 4) UPDATE con CAS.
 * - No gana: 1-3 iguales, más 4) loadSubForUpdate y 5) UPDATE final.
 */
function makeReactivateTx(
  subRow: ReturnType<typeof makeSubscribeSubRow>,
  opts: { reused?: boolean; lockedSubRow?: ReturnType<typeof makeSubscribeSubRow> } = {},
): DbTx {
  const { reused = true, lockedSubRow = subRow } = opts
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow])
    .mockResolvedValueOnce([planRow])
    .mockResolvedValueOnce([ownerRow])
  if (reused) {
    execute.mockResolvedValueOnce([{ tenant_id: TENANT_ID }])
  } else {
    execute.mockResolvedValueOnce([lockedSubRow]).mockResolvedValueOnce([])
  }
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

/**
 * Complemento del control "sigue cancelando como antes": no alcanza con ver
 * `cancelPreapprovalCalls` — un bug en `isPendingNeverCharged` podría cancelar
 * Y de paso dejar `leftPendingMpSubscriptionId` en el audit por error de
 * copy-paste. Busca la llamada de auditoría de esta `tx`/`action` puntual (no
 * `toHaveBeenCalledWith` a secas: en los tests de reuso hay otras llamadas de
 * auditoría en el medio) y confirma que el campo NO está.
 */
function expectNoLeftPending(tx: DbTx, action: string) {
  const call = vi
    .mocked(insertSystemAuditLog)
    .mock.calls.find(([callTx, payload]) => callTx === tx && payload.action === action)
  expect(call).toBeTruthy()
  expect(call?.[1].metadata).not.toHaveProperty('leftPendingMpSubscriptionId')
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

  it('pide un ciclo distinto (mensual pendiente, pide anual) → NO reusa Y NO cancela: el pendiente sigue pending y nunca cobró, se deja vivo (leftPendingMpSubscriptionId en el audit)', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState() // pending mensual, chargedQuantity 0

    await subscribe(TENANT_ID, PLAN_ID, 'annual', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'subscription.subscribe_initiated',
        metadata: expect.objectContaining({ leftPendingMpSubscriptionId: OLD_PREAPPROVAL }),
      }),
    )
  })

  it('el monto no coincide (otro plan, o el precio cambió desde el intento anterior) → NO reusa Y NO cancela: sigue pending sin cobros de este tenant', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ amountCents: planRow.price_monthly - 1 })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('MP dice `authorized` (ya no está pending) → NO reusa Y SIGUE cancelando como antes (no es "pendiente que nunca cobró")', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ status: 'authorized' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.subscribe_initiated')
  })

  it('MP dice `cancelled` → NO reusa', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ status: 'cancelled' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('el `reason` es de otro plan (dos planes podrían costar lo mismo) → NO reusa Y NO cancela: sigue pending sin cobros de este tenant', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: 'TurnoGol — Complejo (mensual)' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('el preapproval es de OTRO tenant → NO reusa Y SIGUE cancelando como antes (aislamiento: no es "de este tenant")', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ externalReference: 'tenant-ajeno' })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.subscribe_initiated')
  })

  it('el pendiente ya cobró algo (chargedQuantity > 0) → NO reusa Y SIGUE cancelando como antes (no es "nunca cobró")', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ chargedQuantity: 1 })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.subscribe_initiated')
  })

  it('el mp_subscription_id cambió mientras esperábamos a MP (otra tx ganó la carrera) → el CAS no reusa un checkout ya muerto, cae a cancelar+crear con el estado fresco', async () => {
    const RACED_PREAPPROVAL = 'mp-pending-2'
    const execute = vi
      .fn()
      .mockResolvedValueOnce([makeSubscribeSubRow()]) // 1) loadSub SIN lock: ve OLD_PREAPPROVAL
      .mockResolvedValueOnce([planRow]) // 2) loadPlan
      .mockResolvedValueOnce([{ n: 0 }]) // 3) countOnlineCourts
      .mockResolvedValueOnce([ownerRow]) // 4) loadTenantOwner
      .mockResolvedValueOnce([]) // 5) CAS del reuso: 0 filas — otra tx ya pisó mp_subscription_id
      .mockResolvedValueOnce([makeSubscribeSubRow({ mp_subscription_id: RACED_PREAPPROVAL })]) // 6) loadSubForUpdate: estado fresco
      .mockResolvedValueOnce([]) // 7) UPDATE final
    const tx = { execute } as unknown as DbTx
    const gateway = new MockGateway()
    // Al momento del GET, sigue viendo el pendiente viejo como reusable —
    // la carrera pasó a nivel DB (otra tx ya escribió mp_subscription_id
    // nuevo), no a nivel MP.
    gateway.subscriptionState = pendingState()

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    // Cancela el preapproval FRESCO (el que dejó la otra tx), no el viejo que
    // vimos en la lectura sin lock.
    expect(gateway.cancelPreapprovalCalls).toEqual([RACED_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    // El id cambió entre lecturas: la condición (a) de "dejar pendiente" ya
    // falla sola, sin necesitar mirar el estado — SIGUE cancelando como antes.
    expectNoLeftPending(tx, 'subscription.subscribe_initiated')
  })

  it('el pendiente tiene un start_date viejo y el trial se extendió después → NO reusa (cobrarían durante la prueba) pero TAMPOCO cancela: sigue pending sin cobros de este tenant', async () => {
    // Soporte corrió `extendTrial` después del intento anterior, así que el
    // preapproval pendiente arrastra la fecha vieja de primer cobro.
    const trialEndsAt = new Date('2027-03-01T00:00:00Z')
    const execute = vi
      .fn()
      .mockResolvedValueOnce([makeSubscribeSubRow()]) // loadSub sin lock
      .mockResolvedValueOnce([planRow])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([{ ...ownerRow, trialEndsAt }])
      .mockResolvedValueOnce([makeSubscribeSubRow()]) // loadSubForUpdate (no reusa)
      .mockResolvedValueOnce([]) // UPDATE final
    const tx = { execute } as unknown as DbTx
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ startDate: new Date('2027-02-01T00:00:00Z') })

    await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx, new Date('2027-01-15T00:00:00Z'))

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
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
      .mockResolvedValueOnce([{ tenant_id: TENANT_ID }]) // CAS del reuso: sigue vigente
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

  it('getSubscriptionState tira error (MP caído) → no propaga, sigue el camino de siempre y termina OK, SIGUE cancelando (estado no-null desconocido, nunca "pendiente que nunca cobró")', async () => {
    const tx = makeSubscribeTx(makeSubscribeSubRow(), { reused: false })
    const gateway = new MockGateway()
    gateway.getSubscriptionState = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    const result = await subscribe(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(result.preapprovalId).toBeTruthy()
    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.subscribe_initiated')
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

  it('el pendiente tiene un primer cobro FUTURO pero reactivar cobra ya → NO reusa Y NO cancela: sigue pending sin cobros de este tenant', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({
      reason: REASON_REACTIVACION,
      startDate: new Date('2026-10-01T00:00:00Z'),
    })

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx, new Date('2026-09-16T21:39:30Z'))

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
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

  it('pide un ciclo distinto → NO reusa Y NO cancela: sigue pending sin cobros de este tenant (leftPendingMpSubscriptionId en el audit)', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: REASON_REACTIVACION }) // pending mensual

    await reactivate(TENANT_ID, PLAN_ID, 'annual', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'subscription.reactivate_initiated',
        metadata: expect.objectContaining({ leftPendingMpSubscriptionId: OLD_PREAPPROVAL }),
      }),
    )
  })

  it('getSubscriptionState tira error → no propaga, sigue el camino de siempre y termina OK, SIGUE cancelando (estado no-null desconocido, nunca "pendiente que nunca cobró")', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), { reused: false })
    const gateway = new MockGateway()
    gateway.getSubscriptionState = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    const result = await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(result.preapprovalId).toBeTruthy()
    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.reactivate_initiated')
  })
})

// ─── reactivate — SIGUE cancelando como antes (contrato §3, casos 1/2/3/5) ──
//
// Espejo de los mismos 5 casos ya cubiertos en `subscribe` arriba: un
// `mp_subscription_id` previo cuyo estado en MP NO es "pendiente que nunca
// cobró" (o cuyo id cambió entre las dos lecturas) sigue cancelándose
// EXACTAMENTE como antes del fix — el audit NO lleva `leftPendingMpSubscriptionId`.
describe('reactivate — sigue cancelando el preapproval viejo cuando NO es "pendiente que nunca cobró"', () => {
  it('MP dice `authorized` (ya no está pending) → SIGUE cancelando como antes', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: REASON_REACTIVACION, status: 'authorized' })

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.reactivate_initiated')
  })

  it('el pendiente ya cobró algo (chargedQuantity > 0) → SIGUE cancelando como antes', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: REASON_REACTIVACION, chargedQuantity: 1 })

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.reactivate_initiated')
  })

  it('el preapproval es de OTRO tenant → SIGUE cancelando como antes (aislamiento)', async () => {
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), { reused: false })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({
      reason: REASON_REACTIVACION,
      externalReference: 'tenant-ajeno',
    })

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual([OLD_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.reactivate_initiated')
  })

  it('carrera: el id que devuelve loadSubForUpdate (con lock) es distinto del leído sin lock → cancela el id FRESCO, no el viejo', async () => {
    const RACED_PREAPPROVAL = 'mp-pending-2'
    // `reused: false` (mismo criterio que la fixture ya soporta, sin tocar
    // src/): la lectura sin lock ve OLD_PREAPPROVAL y su estado sigue siendo
    // "pendiente que nunca cobró" para ESE id — pero el ciclo pedido (anual)
    // no matchea el de la lectura (mensual), así que `reusablePendingCheckout`
    // devuelve null y no se intenta el CAS. `loadSubForUpdate` (la lectura CON
    // lock) devuelve una fila con OTRO id: otra tx ganó la carrera en el medio.
    const tx = makeReactivateTx(makeSubscribeSubRow({ status: 'canceled' }), {
      reused: false,
      lockedSubRow: makeSubscribeSubRow({
        status: 'canceled',
        mp_subscription_id: RACED_PREAPPROVAL,
      }),
    })
    const gateway = new MockGateway()
    gateway.subscriptionState = pendingState({ reason: REASON_REACTIVACION }) // pending, nunca cobró — pero es el id VIEJO

    await reactivate(TENANT_ID, PLAN_ID, 'annual', gateway, tx)

    // Cancela el id FRESCO (el que dejó la otra tx), no el que vimos sin lock:
    // la condición (a) de "dejar pendiente" exige que sea EL MISMO id.
    expect(gateway.cancelPreapprovalCalls).toEqual([RACED_PREAPPROVAL])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expectNoLeftPending(tx, 'subscription.reactivate_initiated')
  })
})
