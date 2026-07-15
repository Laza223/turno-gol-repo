import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fix 2a (R2 🔴, mitad 1 de "un pago en vuelo NO deshace una baja
// voluntaria"): antes de este fix, `cancel()` cancelaba el preapproval en MP
// pero dejaba `mp_subscription_id` intacto en la fila. Si un pago del
// preapproval VIEJO (ya cancelado en MP, pero en vuelo — autorizado antes del
// cancel) llegaba tarde, `onPaymentApproved` (dunning.service.ts) lo
// matcheaba contra ese id todavía presente y reactivaba la suscripción SOLA,
// sin consentimiento del dueño (viola ENS-25/26, Res. 424/2020). Limpiar la
// columna acá cierra el camino: el Fix 2b (dunning.service) deja de tener
// nada contra qué matchear.

vi.mock('@/modules/billing/lifecycle.service', () => ({ transitionToCanceled: vi.fn() }))
vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))
vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
}))

import { cancel } from '@/modules/billing/billing.service'
import { transitionToCanceled } from '@/modules/billing/lifecycle.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { MpGatewayError } from '@/modules/payments/payment.errors'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = 't-1'

function makeTx(mpSubscriptionId: string | null) {
  const subRow = {
    status: 'active',
    plan_id: 'plan-1',
    billing_cycle: 'monthly',
    current_period_start: '2027-01-01T00:00:00Z',
    current_period_end: '2027-02-01T00:00:00Z',
    mp_subscription_id: mpSubscriptionId,
    pending_plan_change: null,
    pending_change_at: null,
    canceled_at: null,
    cancellation_reason: null,
    scheduled_deletion_at: null,
    dunning_started_at: null,
    last_payment_failed_at: null,
    last_payment_at: null,
  }
  const ownerRow = { tenantName: 'Club Norte', ownerName: 'Marcelo', ownerEmail: 'marcelo@x.com' }
  const execute = vi
    .fn()
    .mockResolvedValueOnce([subRow]) // loadSub
    .mockResolvedValueOnce([]) // UPDATE mp_subscription_id = NULL (solo si había uno)
    .mockResolvedValueOnce([ownerRow]) // loadTenantOwner
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cancel — limpia mp_subscription_id al dar de baja voluntariamente (Fix 2a, R2 🔴)', () => {
  it('con preapproval activo: cancela en MP, limpia la columna y audita el id viejo', async () => {
    const tx = makeTx('mp-live-1')
    const gateway = new MockGateway()

    const result = await cancel(TENANT_ID, 'Muy caro', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual(['mp-live-1'])
    expect(transitionToCanceled).toHaveBeenCalledWith(TENANT_ID, 'Muy caro', tx)
    expect(insertSystemAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'subscription.mp_preapproval_cleared',
        metadata: expect.objectContaining({ canceledMpSubscriptionId: 'mp-live-1' }),
      }),
    )
    expect(result.accessUntil.toISOString()).toBe('2027-02-01T00:00:00.000Z')
    expect(tx.execute).toHaveBeenCalledTimes(3) // loadSub, clear-UPDATE, loadTenantOwner
  })

  it('sin preapproval (ya NULL — trial nunca subscribió): no llama a MP ni agrega el audit de limpieza', async () => {
    const tx = makeTx(null)
    const gateway = new MockGateway()

    await cancel(TENANT_ID, 'No lo uso más', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toHaveLength(0)
    expect(insertSystemAuditLog).not.toHaveBeenCalled()
    expect(tx.execute).toHaveBeenCalledTimes(2) // loadSub, loadTenantOwner (sin el clear-UPDATE)
  })

  it('notifica al dueño con enqueueTenantOwnerNotification (comportamiento existente intacto)', async () => {
    const tx = makeTx('mp-live-2')
    const gateway = new MockGateway()

    await cancel(TENANT_ID, 'Cierro el complejo', gateway, tx)

    expect(enqueueTenantOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        templateName: 'subscription_canceled',
      }),
      tx,
    )
  })

  it('si cancelPreapproval falla, propaga y NUNCA transiciona a canceled (todo o nada)', async () => {
    const tx = makeTx('mp-live-3')
    const gateway = new MockGateway()
    gateway.cancelPreapproval = vi.fn().mockRejectedValue(new Error('MP 500'))

    await expect(cancel(TENANT_ID, 'Muy caro', gateway, tx)).rejects.toThrow('MP 500')

    expect(transitionToCanceled).not.toHaveBeenCalled()
    expect(insertSystemAuditLog).not.toHaveBeenCalled()
  })

  // Fix 1 (R2-2 residual — R5 señaló el mismo riesgo menor acá): tolerancia
  // gemela a la de reactivate(). Improbable en cancel() (nadie más cancela el
  // preapproval de este tenant entre lecturas) pero costo cero de cubrirla.
  it('si cancelPreapproval devuelve el 400 de ya-cancelado, tolera y sigue transicionando a canceled', async () => {
    const tx = makeTx('mp-live-4')
    const gateway = new MockGateway()
    gateway.cancelPreapprovalError = new MpGatewayError('Failed to cancel MP preapproval mp-live-4', {
      message: 'You can not modify a cancelled preapproval.',
      status: 400,
    })

    const result = await cancel(TENANT_ID, 'Muy caro', gateway, tx)

    expect(gateway.cancelPreapprovalCalls).toEqual(['mp-live-4'])
    expect(transitionToCanceled).toHaveBeenCalledWith(TENANT_ID, 'Muy caro', tx)
    expect(result.accessUntil.toISOString()).toBe('2027-02-01T00:00:00.000Z')
  })
})
