import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix B4 (🟡→🔴 divergencia MP↔DB, misma clase que B1): antes de este fix,
// `handleUpgradeApproved` leía la suscripción SIN lock, validaba los guards
// de solo-lectura (status==='active', pending_plan_change===targetPlanId) y
// RECIÉN DESPUÉS tocaba MP (`updatePreapprovalAmount`, efecto externo
// irreversible) antes de intentar el UPDATE local. Si entre el loadSub y el
// UPDATE una tx concurrente (ej. el sweep de dunning) sacaba a la
// suscripción de `status='active'`, el UPDATE afectaba 0 filas — el plan
// local NUNCA cambiaba — pero MP ya había sido actualizado al monto nuevo:
// MP cobra el plan nuevo, la DB se queda en el viejo. El fix reordena para
// que el UPDATE (gateado atómicamente con `pending_plan_change=targetPlanId`
// en el WHERE) sea el gate: si afecta 0 filas, MP nunca se toca.

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

import { handleUpgradeApproved } from '@/modules/billing/billing.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { captureMessage } from '@/lib/sentry'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'
const TARGET_PLAN_ID = 'plan-2'
const MP_SUBSCRIPTION_ID = 'mp-live-upgrade-1'
const NEW_AMOUNT = 8_500_000

function makeSubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'active',
    plan_id: 'plan-1',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: MP_SUBSCRIPTION_ID,
    pending_plan_change: TARGET_PLAN_ID,
    pending_change_at: '2027-01-15T00:00:00Z',
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
  id: TARGET_PLAN_ID,
  slug: 'complejo',
  name: 'Complejo',
  max_courts: 5,
  price_monthly: NEW_AMOUNT,
  price_annual: 85_000_000,
}

/**
 * updateRows: lo que devuelve el UPDATE final sobre `tenant_subscriptions`.
 * `[]` simula el TOCTOU (una tx concurrente ya sacó el estado de `active` o
 * ya consumió el `pending_plan_change` antes de que este UPDATE corra).
 */
function makeTx(updateRows: Array<{ id: string }>) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([makeSubRow()]) // loadSub
    .mockResolvedValueOnce([planRow]) // loadPlan
    .mockResolvedValueOnce(updateRows) // UPDATE tenant_subscriptions
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleUpgradeApproved — TOCTOU entre loadSub y el UPDATE (B4 🔴)', () => {
  it('UPDATE afecta 0 filas (estado cambió concurrentemente) → MP NUNCA se toca', async () => {
    const tx = makeTx([]) // 0 filas — race concurrente
    const gateway = new MockGateway()

    await handleUpgradeApproved(TENANT_ID, TARGET_PLAN_ID, gateway, tx)

    expect(gateway.updatePreapprovalCalls).toEqual([])
    expect(insertSystemAuditLog).not.toHaveBeenCalled()
  })

  // 01-billing-upgrade-dedup: antes de este fix, el 0-filas de arriba
  // devolvía en silencio — un pago YA ACREDITADO en MP que no encontraba
  // dónde aplicarse en la DB no dejaba rastro en Sentry ni en audit_logs
  // (mismo patrón de captureMessage que dunning.service.ts:onPaymentApproved
  // para su propio caso de pago-sin-match).
  it('UPDATE afecta 0 filas → captureMessage con contexto, para conciliación manual', async () => {
    const tx = makeTx([]) // 0 filas — race concurrente
    const gateway = new MockGateway()

    await handleUpgradeApproved(TENANT_ID, TARGET_PLAN_ID, gateway, tx, 'mp-pay-123')

    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('CAS UPDATE affected 0 rows'),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          tenantId: TENANT_ID,
          targetPlanId: TARGET_PLAN_ID,
          pendingPlanChange: TARGET_PLAN_ID,
          mpPaymentId: 'mp-pay-123',
        }),
      }),
    )
  })

  it('UPDATE afecta 1 fila → MP se actualiza al monto nuevo y se audita upgrade_completed', async () => {
    const tx = makeTx([{ id: 'sub-1' }]) // 1 fila — camino feliz
    const gateway = new MockGateway()

    await handleUpgradeApproved(TENANT_ID, TARGET_PLAN_ID, gateway, tx)

    expect(gateway.updatePreapprovalCalls).toEqual([
      { preapprovalId: MP_SUBSCRIPTION_ID, amount: NEW_AMOUNT },
    ])
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'subscription.upgrade_completed',
        metadata: expect.objectContaining({ fromPlanId: 'plan-1', toPlanId: TARGET_PLAN_ID }),
      }),
    )
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
