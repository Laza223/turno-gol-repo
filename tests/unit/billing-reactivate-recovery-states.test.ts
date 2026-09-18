import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-20: reactivate() (billing.service.ts) solo permitía pedir un preapproval
// nuevo desde canceled/churned — dejaba afuera justo los 2 estados que más
// necesitan un botón de "pagar ahora" según doc4 §2 (`suspended`: "Reintento
// manual"; `blocked`: "Re-activación"). `past_due` queda deliberadamente
// AFUERA: tiene reintento automático de MP en curso (doc4: "Reintento
// automático") y crear un segundo preapproval mientras el primero sigue vivo
// arriesga un doble cobro cuando ambos terminen aprobándose.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { reactivate } from '@/modules/billing/billing.service'
import { ReactivateNotAllowedError } from '@/modules/billing/billing.errors'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { MpGatewayError } from '@/modules/payments/payment.errors'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
/** Canchas por las que se reactiva. 3 prendidas (`makeTx`), así que pasa el piso. */
const BILLED_COURTS = 3
const ONLINE_COURTS = 3

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

const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: 'marcelo@x.com' }

function makeSubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'canceled',
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    billed_courts: 3,
    pending_billed_courts: null,
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: 'mp-old',
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
 * tx.execute order dentro de `reactivate()`: 1) loadSub (sin lock, Fix D4-A1),
 * 2) loadActivePlan, 3) countOnlineCourts (piso de canchas facturadas — con
 * precio por cancha `reactivate()` también lo mide, antes no lo hacía),
 * 4) loadTenantOwner, 5) loadSubForUpdate, 6) el UPDATE final.
 *
 * `mp_subscription_id = 'mp-old'` → reactivate() SÍ intenta reusar (GET a MP
 * vía reusablePendingCheckout), pero `new MockGateway()` sin
 * `subscriptionState` sembrado devuelve null → nunca reusa y cae derecho a
 * pedir el lock real (mismo estado que la lectura sin lock: nada cambió).
 */
function makeTx(subRow: ReturnType<typeof makeSubRow>) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub (sin lock)
    .mockResolvedValueOnce([planRow]) // loadActivePlan
    .mockResolvedValueOnce([{ n: ONLINE_COURTS }]) // countOnlineCourts
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
    .mockResolvedValueOnce([subRow]) // loadSubForUpdate
    .mockResolvedValueOnce([]) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

function txForStatus(status: string, opts: { scheduledDeletionAt?: string | null } = {}) {
  return makeTx(makeSubRow({ status, scheduled_deletion_at: opts.scheduledDeletionAt ?? null }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reactivate — estados habilitados (ENS-20)', () => {
  it.each(['suspended', 'blocked', 'churned', 'canceled'])(
    'permite pedir un preapproval nuevo desde %s',
    async (status) => {
      const tx = txForStatus(status)
      const gateway = new MockGateway()

      const result = await reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)

      expect(result.checkoutUrl).toContain('mp.test')
      expect(gateway.preapprovalCalls).toHaveLength(1)
      // 3 canchas mensual: $47.000 + 2 × $30.000 = $107.000.
      expect(gateway.preapprovalCalls[0]?.amount).toBe(10_700_000)
    },
  )

  it('rechaza past_due — MP ya reintenta automáticamente, evita un segundo preapproval', async () => {
    const tx = txForStatus('past_due')
    const gateway = new MockGateway()

    await expect(
      reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })

  it('rechaza active — no hay nada que reactivar', async () => {
    const tx = txForStatus('active')
    const gateway = new MockGateway()

    await expect(
      reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })

  it('churned con scheduled_deletion_at vencido sigue rechazado (deadline real, no DB)', async () => {
    const tx = txForStatus('churned', { scheduledDeletionAt: '2020-01-01T00:00:00Z' })
    const gateway = new MockGateway()

    await expect(
      reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })
})

// El piso de canchas facturadas (`assertBilledCourtsCoverOnline`) también
// corre acá: reactivar es exactamente el momento en que alguien podría volver
// pagando por menos canchas de las que dejó prendidas. Con bandas este gate
// solo existía al BAJAR de plan, así que `reactivate()` no lo tenía.
describe('reactivate — el piso de canchas prendidas también aplica al volver', () => {
  it('reactivar por menos canchas de las prendidas → bloqueado, sin tocar MP', async () => {
    const tx = txForStatus('canceled') // 3 canchas prendidas
    const gateway = new MockGateway()

    await expect(reactivate(TENANT_ID, 2, 'monthly', gateway, tx)).rejects.toMatchObject({
      code: 'DOWNGRADE_BLOCKED',
    })
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })
})

// R2 🔴: el preapproval VIEJO (`mp-old`, seedeado por `makeSubRow`) sigue vivo
// en MP reintentando automáticamente (el dunning sweep solo escala estado
// local, nunca llama a MP — ver `dunning-retry.worker.ts`). Antes de este fix
// `reactivate()` pisaba `mp_subscription_id` con el preapproval nuevo SIN
// cancelar el viejo → dos preapprovals cobrando lo mismo. Estos tests prueban
// que `cancelPreapproval('mp-old')` se llama ANTES de `createPreapproval`
// (mismo patrón que `cancel()`).
describe('reactivate — cancela el preapproval viejo antes de crear el nuevo (Fix 1, R2 🔴)', () => {
  it.each(['suspended', 'blocked', 'churned', 'canceled'])(
    '%s: cancela mp-old en MP antes de pedir el preapproval nuevo',
    async (status) => {
      const tx = txForStatus(status)
      const gateway = new MockGateway()

      await reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)

      expect(gateway.cancelPreapprovalCalls).toEqual(['mp-old'])
      expect(gateway.preapprovalCalls).toHaveLength(1)
    },
  )

  it('sin preapproval viejo (mp_subscription_id NULL — baja voluntaria previa, Fix 2) no llama a cancelPreapproval', async () => {
    // Fix D4-A1: mp_subscription_id NULL → ni siquiera intenta reusar (no hay
    // preapproval que consultar), cae derecho a pedir el lock real.
    const tx = makeTx(makeSubRow({ status: 'canceled', mp_subscription_id: null }))
    const gateway = new MockGateway()

    await reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('si cancelPreapproval falla, propaga el error y NO crea el preapproval nuevo (bias: nunca dos preapprovals vivos)', async () => {
    const tx = txForStatus('suspended')
    const gateway = new MockGateway()
    gateway.cancelPreapproval = vi.fn().mockRejectedValue(new Error('MP 500'))

    await expect(reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)).rejects.toThrow(
      'MP 500',
    )
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })
})

// Fix 1 (R2-2 residual, reviewer R5 — verificado contra MP real por el
// orquestador 2026-07-14, ver ENSAYO_GENERAL.md ledger): `cancelPreapproval`
// del viejo (`mp-old`) tuvo éxito en MP pero un rollback local posterior (el
// `createPreapproval` de más abajo falló) dejó `mp_subscription_id` intacto
// apuntando a un preapproval que YA está `cancelled` en MP. El reintento del
// dueño vuelve a llamar `cancelPreapproval('mp-old')`, y MP devuelve HTTP 400
// "You can not modify a cancelled preapproval." — sin tolerancia, el dueño
// queda trabado para siempre en el único flujo que existe para dejarlo pagar.
describe('reactivate — tolera "preapproval ya cancelado" al reintentar (Fix 1, R2-2 residual)', () => {
  const ALREADY_CANCELLED_MP_ERROR = new MpGatewayError('Failed to cancel MP preapproval mp-old', {
    message: 'You can not modify a cancelled preapproval.',
    status: 400,
  })

  it('cancel del viejo devuelve el 400 de ya-cancelado → reactivate sigue y crea el nuevo', async () => {
    const tx = txForStatus('suspended')
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = ALREADY_CANCELLED_MP_ERROR

    const result = await reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual(['mp-old'])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(result.checkoutUrl).toContain('mp.test')
  })

  it('control: otro error de cancelPreapproval (no el 400 de ya-cancelado) → reactivación falla, NO crea el nuevo', async () => {
    const tx = txForStatus('suspended')
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = new MpGatewayError('Failed to cancel MP preapproval mp-old', {
      message: 'internal server error',
      status: 500,
    })

    await expect(reactivate(TENANT_ID, BILLED_COURTS, 'monthly', gateway, tx)).rejects.toThrow(
      'Failed to cancel MP preapproval mp-old',
    )
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })
})
