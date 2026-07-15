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
const PLAN_ID = 'plan-1'

function makeTx(status: string, opts: { scheduledDeletionAt?: string | null } = {}) {
  const subRow = {
    status,
    plan_id: 'plan-old',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: 'mp-old',
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: opts.scheduledDeletionAt ?? null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
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
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub
    .mockResolvedValueOnce([planRow]) // loadPlan
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
    .mockResolvedValueOnce([]) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reactivate — estados habilitados (ENS-20)', () => {
  it.each(['suspended', 'blocked', 'churned', 'canceled'])(
    'permite pedir un preapproval nuevo desde %s',
    async (status) => {
      const tx = makeTx(status)
      const gateway = new MockGateway()

      const result = await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

      expect(result.checkoutUrl).toContain('mp.test')
      expect(gateway.preapprovalCalls).toHaveLength(1)
    },
  )

  it('rechaza past_due — MP ya reintenta automáticamente, evita un segundo preapproval', async () => {
    const tx = makeTx('past_due')
    const gateway = new MockGateway()

    await expect(
      reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })

  it('rechaza active — no hay nada que reactivar', async () => {
    const tx = makeTx('active')
    const gateway = new MockGateway()

    await expect(
      reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })

  it('churned con scheduled_deletion_at vencido sigue rechazado (deadline real, no DB)', async () => {
    const tx = makeTx('churned', { scheduledDeletionAt: '2020-01-01T00:00:00Z' })
    const gateway = new MockGateway()

    await expect(
      reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(gateway.preapprovalCalls).toHaveLength(0)
    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
  })
})

// R2 🔴: el preapproval VIEJO (`mp-old`, seedeado por `makeTx`) sigue vivo en
// MP reintentando automáticamente (el dunning sweep solo escala estado
// local, nunca llama a MP — ver `dunning-retry.worker.ts`). Antes de este fix
// `reactivate()` pisaba `mp_subscription_id` con el preapproval nuevo SIN
// cancelar el viejo → dos preapprovals cobrando el mismo plan. Estos tests
// prueban que `cancelPreapproval('mp-old')` se llama ANTES de
// `createPreapproval` (mismo patrón que `cancel()`).
describe('reactivate — cancela el preapproval viejo antes de crear el nuevo (Fix 1, R2 🔴)', () => {
  it.each(['suspended', 'blocked', 'churned', 'canceled'])(
    '%s: cancela mp-old en MP antes de pedir el preapproval nuevo',
    async (status) => {
      const tx = makeTx(status)
      const gateway = new MockGateway()

      await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

      expect(gateway.cancelPreapprovalCalls).toEqual(['mp-old'])
      expect(gateway.preapprovalCalls).toHaveLength(1)
    },
  )

  it('sin preapproval viejo (mp_subscription_id NULL — baja voluntaria previa, Fix 2) no llama a cancelPreapproval', async () => {
    const subRow = {
      status: 'canceled',
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
    const execute = vi
      .fn()
      .mockResolvedValueOnce([subRow])
      .mockResolvedValueOnce([planRow])
      .mockResolvedValueOnce([ownerRow])
      .mockResolvedValueOnce([])
    const tx = { execute } as unknown as DbTx
    const gateway = new MockGateway()

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(gateway.preapprovalCalls).toHaveLength(1)
  })

  it('si cancelPreapproval falla, propaga el error y NO crea el preapproval nuevo (bias: nunca dos preapprovals vivos)', async () => {
    const tx = makeTx('suspended')
    const gateway = new MockGateway()
    gateway.cancelPreapproval = vi.fn().mockRejectedValue(new Error('MP 500'))

    await expect(
      reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx),
    ).rejects.toThrow('MP 500')
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
    const tx = makeTx('suspended')
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = ALREADY_CANCELLED_MP_ERROR

    const result = await reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual(['mp-old'])
    expect(gateway.preapprovalCalls).toHaveLength(1)
    expect(result.checkoutUrl).toContain('mp.test')
  })

  it('control: otro error de cancelPreapproval (no el 400 de ya-cancelado) → reactivación falla, NO crea el nuevo', async () => {
    const tx = makeTx('suspended')
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = new MpGatewayError('Failed to cancel MP preapproval mp-old', {
      message: 'internal server error',
      status: 500,
    })

    await expect(reactivate(TENANT_ID, PLAN_ID, 'monthly', gateway, tx)).rejects.toThrow(
      'Failed to cancel MP preapproval mp-old',
    )
    expect(gateway.preapprovalCalls).toHaveLength(0)
  })
})
