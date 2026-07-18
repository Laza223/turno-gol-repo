import { beforeEach, describe, expect, it, vi } from 'vitest'

// ENS-20 (b, c, d): un pago aprobado durante el ciclo de dunning debe
// reactivar el tenant sea cual sea el estado en que esté atascado, no solo
// past_due. Antes del fix, `canceled` quedaba explícitamente excluido
// (no-op, "preapproval debería estar cancelada en MP, ignorar") — pero
// billing.service.reactivate() YA permite pedir un preapproval NUEVO desde
// canceled/churned/suspended/blocked (ver ENS-20): el webhook de ESE pago
// nuevo llegaba y onPaymentApproved lo ignoraba en silencio, dejando al
// tenant pago-pero-nunca-reactivado.
//
// Fix 2b (R2 🔴 — "un pago en vuelo no deshace una baja voluntaria"): el
// bloque de abajo ("Fix 2b — matching de preapproval") cubre el caso
// contrario: un pago aprobado de un preapproval que NO matchea la
// suscripción actual (típicamente porque `cancel()` la limpió a NULL, Fix
// 2a) NO debe reactivar. `preapprovalId`/`mpPaymentId` son parámetros nuevos
// y OPCIONALES — `undefined` (caller no los conoce, ej. estos primeros tests
// y todo caller preexistente) sigue confiando en la máquina de estados como
// antes; solo un valor explícito que NO matchea bloquea.

vi.mock('@/modules/billing/lifecycle.service', () => ({
  transitionTrialingToActive: vi.fn(),
  transitionPastDueToActive: vi.fn(),
  transitionToActiveFromAny: vi.fn(),
}))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))

import { onPaymentApproved } from '@/modules/billing/dunning.service'
import {
  transitionPastDueToActive,
  transitionToActiveFromAny,
  transitionTrialingToActive,
} from '@/modules/billing/lifecycle.service'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { captureMessage } from '@/lib/sentry'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 'tenant-1'
const PAID_AT = new Date('2027-04-20T00:00:00Z')

function makeTx(status: string, mpSubscriptionId: string | null = 'mp-1') {
  const subRow = {
    status,
    billing_cycle: 'monthly',
    current_period_end: '2027-05-01T00:00:00Z',
    mp_subscription_id: mpSubscriptionId,
    plan_name: 'Predio',
  }
  const tenantInfoRow = { tenantName: 'Club Norte', ownerName: 'Marcelo' }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([{ id: 'lock-1' }]) // lockWebhook: evento fresco (INSERT ... RETURNING id)
    .mockResolvedValueOnce([subRow]) // loadSub
    .mockResolvedValueOnce([tenantInfoRow]) // loadTenantInfo
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('onPaymentApproved — recovery desde estados de dunning (ENS-20)', () => {
  it.each(['suspended', 'blocked', 'churned', 'canceled'])(
    '%s → active vía transitionToActiveFromAny (nunca no-op), con el preapproval del pago matcheando el vigente',
    async (status) => {
      const tx = makeTx(status, 'mp-1')
      const result = await onPaymentApproved(
        TENANT_ID,
        `mp-evt-${status}`,
        'subscription_authorized_payment',
        { test: 1 },
        PAID_AT,
        tx,
        `mp-pay-${status}`,
        'mp-1', // matchea sub.mp_subscription_id
      )

      expect(result.alreadyProcessed).toBe(false)
      expect(transitionToActiveFromAny).toHaveBeenCalledTimes(1)
      expect(transitionToActiveFromAny).toHaveBeenCalledWith(
        TENANT_ID,
        PAID_AT,
        expect.any(Date),
        tx,
      )
      expect(transitionPastDueToActive).not.toHaveBeenCalled()
      expect(transitionTrialingToActive).not.toHaveBeenCalled()
      expect(enqueueTenantOwnerNotification).toHaveBeenCalledTimes(1)
      expect(enqueueTenantOwnerNotification).toHaveBeenCalledWith(
        expect.objectContaining({ templateName: 'subscription_renewed' }),
        tx,
      )
      expect(captureMessage).not.toHaveBeenCalled()
    },
  )

  it('past_due sigue yendo por transitionPastDueToActive (dispatch sin cambios), preapproval matcheando', async () => {
    const tx = makeTx('past_due', 'mp-1')
    await onPaymentApproved(
      TENANT_ID,
      'mp-evt-past-due',
      'subscription_authorized_payment',
      { test: 1 },
      PAID_AT,
      tx,
      'mp-pay-past-due',
      'mp-1',
    )
    expect(transitionPastDueToActive).toHaveBeenCalledTimes(1)
    expect(transitionToActiveFromAny).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })
})

// ─── Fix 2b — matching de preapproval (R2 🔴) ───────────────────────────────

describe('onPaymentApproved — Fix 2b: solo reactiva si el preapproval del pago matchea el vigente (R2 🔴)', () => {
  it('(iii) canceled con mp_subscription_id NULL (baja voluntaria, Fix 2a) + pago de un preapproval viejo en vuelo → NO reactiva, alerta, sin mail', async () => {
    const tx = makeTx('canceled', null)

    const result = await onPaymentApproved(
      TENANT_ID,
      'mp-evt-orphan',
      'subscription_authorized_payment',
      { test: 1 },
      PAID_AT,
      tx,
      'mp-pay-orphan',
      'mp-old-canceled', // el preapproval YA cancelado, en vuelo
    )

    expect(result.alreadyProcessed).toBe(false)
    expect(transitionToActiveFromAny).not.toHaveBeenCalled()
    expect(transitionPastDueToActive).not.toHaveBeenCalled()
    expect(transitionTrialingToActive).not.toHaveBeenCalled()
    expect(enqueueTenantOwnerNotification).not.toHaveBeenCalled() // sin mail subscription_renewed
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          tenantId: TENANT_ID,
          mpPaymentId: 'mp-pay-orphan',
          preapprovalId: 'mp-old-canceled',
        }),
      }),
    )
  })

  it('mismatch en past_due (preapproval distinto al vigente, no null) → NO reactiva', async () => {
    const tx = makeTx('past_due', 'mp-current')

    await onPaymentApproved(
      TENANT_ID,
      'mp-evt-mismatch-pd',
      'subscription_authorized_payment',
      { test: 1 },
      PAID_AT,
      tx,
      'mp-pay-mismatch',
      'mp-different',
    )

    expect(transitionPastDueToActive).not.toHaveBeenCalled()
    expect(enqueueTenantOwnerNotification).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })

  it('active con preapproval que no matchea → NO extiende el período (defensa en profundidad, misma clase)', async () => {
    const tx = makeTx('active', 'mp-current')

    await onPaymentApproved(
      TENANT_ID,
      'mp-evt-mismatch-active',
      'subscription_authorized_payment',
      { test: 1 },
      PAID_AT,
      tx,
      'mp-pay-mismatch-active',
      'mp-different',
    )

    expect(enqueueTenantOwnerNotification).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledTimes(1)
    // El mismatch corta ANTES de loadTenantInfo y del UPDATE que extiende
    // current_period_end: solo lockWebhook + loadSub corrieron.
    expect((tx.execute as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('preapprovalId NO provisto (undefined, caller que no lo conoce) → compat retro: confía en la máquina de estados', async () => {
    const tx = makeTx('suspended', 'mp-1')

    const result = await onPaymentApproved(
      TENANT_ID,
      'mp-evt-legacy-caller',
      'subscription_authorized_payment',
      { test: 1 },
      PAID_AT,
      tx,
      // sin mpPaymentId ni preapprovalId — firma vieja de 6 args
    )

    expect(result.alreadyProcessed).toBe(false)
    expect(transitionToActiveFromAny).toHaveBeenCalledTimes(1)
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('preapprovalId explícitamente null (MP no lo devolvió) + mp_subscription_id también NULL → NO reactiva (ambigüedad = no confiar)', async () => {
    const tx = makeTx('canceled', null)

    await onPaymentApproved(
      TENANT_ID,
      'mp-evt-both-null',
      'subscription_authorized_payment',
      { test: 1 },
      PAID_AT,
      tx,
      'mp-pay-both-null',
      null,
    )

    expect(transitionToActiveFromAny).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledTimes(1)
  })
})
