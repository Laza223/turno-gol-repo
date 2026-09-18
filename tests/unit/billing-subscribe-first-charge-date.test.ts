import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix trial-first-charge (plata real, cliente real): "Activar plan" armaba el
// preapproval en MP sin `auto_recurring.start_date`, así que MercadoPago podía
// cobrar el primer ciclo DE INMEDIATO aunque el tenant todavía tuviera trial
// vigente. Decisión del dueño (no re-litigar): el complejo puede elegir y
// confirmar su plan cuando quiera, pero el PRIMER COBRO tiene que salir recién
// cuando termina la prueba — elegir plan no le puede sacar plata antes.
//
// Fuente de la fecha: SIEMPRE `tenants.trial_ends_at`, NUNCA
// `tenant_subscriptions.current_period_end` (se desincroniza cuando soporte
// extiende el trial a mano — bug conocido documentado aparte). `loadTenantOwner`
// ya hacía `SELECT ... FROM tenants t` para el dueño/tenantName; se le sumó la
// columna en vez de una query nueva. La secuencia de `tx.execute` de
// `subscribe()` es loadSub → loadActivePlan → countOnlineCourts (piso de
// canchas facturadas) → loadTenantOwner → loadSubForUpdate → UPDATE — mismo
// orden que `billing-subscribe-orphan-guard.test.ts` y
// `billing-payer-email.test.ts`.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { subscribe } from '@/modules/billing/billing.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
/** Canchas facturadas del pedido. Con 0 prendidas cualquier número ≥ 1 pasa el piso. */
const BILLED_COURTS = 1
const NOW = new Date('2026-09-07T12:00:00Z')

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

/** Fila única de `plans` desde la migr. 091: el monto sale de estas 3 columnas. */
const planRow = {
  id: 'plan-turnogol',
  slug: 'turnogol',
  name: 'TurnoGol',
  max_courts: null,
  price_monthly: 4_700_000,
  price_annual: 4_230_000,
  price_first_court_cents: 4_700_000,
  price_extra_court_cents: 3_000_000,
  annual_discount_bps: 1_000,
}

/** `trialEndsAt` en el shape que devuelve `loadTenantOwner` (columna de `tenants`). */
function makeTx(trialEndsAt: string | null): DbTx {
  const ownerRow = {
    tenantName: 'Club Norte',
    ownerName: 'Marcelo',
    ownerEmail: 'marcelo@x.com',
    trialEndsAt,
  }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([makeSubRow()]) // loadSub (sin lock)
    .mockResolvedValueOnce([planRow]) // loadActivePlan
    .mockResolvedValueOnce([{ n: 0 }]) // countOnlineCourts (piso: 0 prendidas, nunca bloquea)
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
    // Fix D4-A1: mp_subscription_id siempre NULL acá → nunca reusa, cae
    // directo a pedir el lock real (mismo estado: nada cambió).
    .mockResolvedValueOnce([makeSubRow()]) // loadSubForUpdate
    .mockResolvedValueOnce([]) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribe — el primer cobro no puede salir antes de que termine el trial', () => {
  it('con trial_ends_at en el futuro: manda firstChargeAt = esa fecha al gateway', async () => {
    const tx = makeTx('2026-12-06T00:00:00.000Z')
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx, NOW)

    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]?.firstChargeAt).toEqual(new Date('2026-12-06T00:00:00.000Z'))
  })

  it('con trial_ends_at ya vencido (ej. soporte lo extendió a una fecha que ya pasó): NO manda firstChargeAt', async () => {
    const tx = makeTx('2026-01-01T00:00:00.000Z')
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx, NOW)

    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]?.firstChargeAt).toBeUndefined()
  })

  it('con trial_ends_at NULL (dato inconsistente, tenant trialing sin fecha): NO manda firstChargeAt', async () => {
    const tx = makeTx(null)
    const gateway = new MockGateway()

    await subscribe(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx, NOW)

    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(gateway.preapprovalCalls[0]?.firstChargeAt).toBeUndefined()
  })
})
