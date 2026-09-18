import { beforeEach, describe, expect, it, vi } from 'vitest'

// El guard de CUPO de plan murió con las bandas (migr. 090/091, decisión
// 2026-09-17 P3): ya no hay techo que respetar — sumar una cancha no se
// bloquea, cuesta $30.000 más por mes.
//
// Lo que sobrevive es el invariante OPUESTO, y por la misma razón de siempre
// (comentario de `canchas/actions.ts:toggleStatus`): nadie puede facturar por
// MENOS canchas de las que tiene PRENDIDAS. Sin ese piso, apagar canchas →
// bajar la cuota → volver a prenderlas deja al complejo operando de más y
// pagando de menos. `billedCourts` llega del cliente, así que el chequeo es
// server-side siempre (el `max(200)` de `billing.schema.ts` es un tope de
// cordura del transporte, no este invariante).
//
// Facturar por MÁS canchas de las prendidas SÍ se permite a propósito: el
// dueño que va a prender la cuarta cancha la semana que viene puede dejar el
// cobro listo hoy. El error conserva nombre y code (`DOWNGRADE_BLOCKED`)
// porque las rutas y la UI ya los mapean.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { subscribe } from '@/modules/billing/billing.service'
import { DowngradeBlockedError } from '@/modules/billing/billing.errors'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'

function makeSubRow() {
  return {
    status: 'trialing',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    billed_courts: 1,
    pending_billed_courts: null,
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: null,
    mp_payer_email: null,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
  }
}

/**
 * La fila ÚNICA de `plans` desde la migr. 091 (`slug = 'turnogol'`,
 * `max_courts = NULL`). `price_monthly`/`price_annual` quedan como referencia
 * histórica: el monto ya no sale de ahí sino de las tres columnas de precio
 * por cancha.
 */
const PLAN_ROW = {
  id: 'plan-turnogol',
  slug: 'turnogol',
  name: 'TurnoGol',
  max_courts: null,
  price_monthly: 4_700_000,
  price_annual: 4_230_000,
  price_first_court_cents: 4_700_000, // $47.000 la primera
  price_extra_court_cents: 3_000_000, // $30.000 cada extra
  annual_discount_bps: 1_000, // 10% off
}

const OWNER_ROW = {
  tenantName: 'Club Norte',
  ownerName: 'Marcelo',
  ownerEmail: 'marcelo@x.com',
  trialEndsAt: null,
}

/**
 * Orden de `tx.execute` dentro de `subscribe()`: 1) loadSub (sin lock, Fix
 * D4-A1), 2) loadActivePlan, 3) countOnlineCourts, 4) loadTenantOwner,
 * 5) loadSubForUpdate (`mp_subscription_id` es siempre NULL en `makeSubRow`,
 * así que nunca hay checkout que reusar y se cae derecho al lock real),
 * 6) el UPDATE final. Cuando el piso bloquea, `subscribe()` tira en el paso 3
 * y la tx nunca llega a pedir el dueño.
 */
function makeTx(onlineCourts: number) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([makeSubRow()]) // loadSub (sin lock)
    .mockResolvedValueOnce([PLAN_ROW]) // loadActivePlan
    .mockResolvedValueOnce([{ n: onlineCourts }]) // countOnlineCourts
    .mockResolvedValueOnce([OWNER_ROW]) // loadTenantOwner
    .mockResolvedValueOnce([makeSubRow()]) // loadSubForUpdate
    .mockResolvedValueOnce([]) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribe — piso: la cuota tiene que cubrir las canchas prendidas', () => {
  it('facturar por menos canchas de las prendidas → DowngradeBlockedError, sin llegar a MP', async () => {
    const tx = makeTx(5) // 5 canchas prendidas
    const gateway = new MockGateway()

    await expect(subscribe(TENANT_ID, 3, 'monthly', gateway, tx)).rejects.toBeInstanceOf(
      DowngradeBlockedError,
    )
    // El rechazo tiene que ser ANTES de tocar MP: nunca crear un preapproval
    // por menos canchas de las que el complejo ya está usando.
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })

  it('el error lleva las DOS cantidades, que es lo que la ruta necesita para el mensaje', async () => {
    const tx = makeTx(5)

    await expect(subscribe(TENANT_ID, 3, 'monthly', new MockGateway(), tx)).rejects.toMatchObject({
      code: 'DOWNGRADE_BLOCKED',
      currentCourtCount: 5,
      targetBilledCourts: 3,
    })
  })

  it('facturar exactamente por las canchas prendidas → pasa, y el monto es el de la regla lineal', async () => {
    const tx = makeTx(5)
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, 5, 'monthly', gateway, tx)

    expect(gateway.preapprovalCalls).toHaveLength(1)
    // $47.000 + 4 × $30.000 = $167.000 (tabla de la decisión, no recalculado).
    expect(gateway.preapprovalCalls[0]?.amount).toBe(16_700_000)
  })

  it('facturar por MÁS canchas de las prendidas SÍ se permite (las va a prender la semana que viene)', async () => {
    const tx = makeTx(2) // solo 2 prendidas hoy
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, 5, 'monthly', gateway, tx)

    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]?.amount).toBe(16_700_000)
  })

  it('sin ninguna cancha prendida todavía: se puede contratar por una', async () => {
    const tx = makeTx(0)
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, 1, 'monthly', gateway, tx)

    expect(gateway.preapprovalCalls[0]?.amount).toBe(4_700_000) // $47.000
  })

  it('cero canchas facturadas → bloqueado: el piso del modelo es una cancha', async () => {
    const tx = makeTx(0)
    const gateway = new MockGateway()

    await expect(subscribe(TENANT_ID, 0, 'monthly', gateway, tx)).rejects.toBeInstanceOf(
      DowngradeBlockedError,
    )
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })

  it('una cantidad no entera no se redondea: se rechaza antes de tocar MP', async () => {
    const tx = makeTx(1)
    const gateway = new MockGateway()

    await expect(subscribe(TENANT_ID, 2.5, 'monthly', gateway, tx)).rejects.toBeInstanceOf(
      DowngradeBlockedError,
    )
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })

  it('ciclo anual: el preapproval cobra el equivalente mensual con 10% off POR 12', async () => {
    const tx = makeTx(5)
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, 5, 'annual', gateway, tx)

    // $150.300 por mes × 12 = $1.803.600 al año. Mandar el equivalente
    // mensual a pelo le cobraría al complejo 12 veces menos.
    expect(gateway.preapprovalCalls[0]?.amount).toBe(15_030_000 * 12)
    expect(gateway.preapprovalCalls[0]?.frequency).toBe('annual')
  })

  it('el `reason` que ve el pagador en MercadoPago nombra las canchas, no un plan', async () => {
    const tx = makeTx(5)
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, 5, 'monthly', gateway, tx)

    // Es además el ÚNICO vínculo entre un preapproval y la cantidad de canchas
    // que representa (MP no tiene campo estructurado), así que
    // `reusablePendingCheckout` lo compara.
    expect(gateway.preapprovalCalls[0]?.reason).toBe('TurnoGol — 5 canchas (mensual)')
  })
})
