import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { transitionCanceledToBlocked } from '@/modules/billing/lifecycle.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getOrCreatePlanId } from '../helpers/factories'

/**
 * B5 (Fase 3, huérfano MP↔DB): `transitionCanceledToBlocked` corría con un
 * `mp_subscription_id = NULL` incondicional en el UPDATE. Un `canceled` con
 * `mp_subscription_id` no-nulo es SIEMPRE una reactivación en curso
 * (`reactivate()` acepta `canceled` como origen y escribe un preapproval
 * nuevo sin cambiar el status) — nulearlo acá borraba la referencia al
 * preapproval recién creado y `onPaymentApproved` quedaba sin poder
 * matchearlo (pago huérfano). Este test falla con el código viejo: el id
 * queda NULL después de la transición.
 */
describe('transitionCanceledToBlocked preserva mp_subscription_id (B5)', () => {
  beforeAll(async () => {
    const s = getSql()
    await ensureRoles(s)
    await cleanupAll(s)
  }, 30_000)

  afterAll(async () => {
    await cleanupAll(getSql())
    await closeSql()
  })

  it('canceled con mp_subscription_id no-nulo (reactivación en curso) → blocked, id preservado, scheduled_deletion_at seteado', async () => {
    const s = getSql()
    const tenant = await createTestTenant(s)
    const planId = await getOrCreatePlanId(s)

    await s`
      INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, billing_cycle, status,
        current_period_start, current_period_end, mp_subscription_id
      ) VALUES (
        ${tenant.id},
        ${planId},
        'monthly'::billing_cycle,
        'canceled'::subscription_status,
        NOW() - INTERVAL '90 days',
        NOW() - INTERVAL '1 days',
        ${'mp-reactivated-1'}
      )
    `
    await s`UPDATE tenants SET status = 'canceled'::tenant_status WHERE id = ${tenant.id}`

    await withTenantContext(tenant.id, async (tx) => {
      await transitionCanceledToBlocked(tenant.id, tx)
    })

    const [sub] = await s<
      Array<{
        status: string
        mp_subscription_id: string | null
        scheduled_deletion_at: Date | null
      }>
    >`
      SELECT status, mp_subscription_id, scheduled_deletion_at
      FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(sub.status).toBe('blocked')
    expect(sub.mp_subscription_id).toBe('mp-reactivated-1')
    expect(sub.scheduled_deletion_at).not.toBeNull()

    const [tenantRow] = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenant.id}
    `
    expect(tenantRow.status).toBe('blocked')
  }, 30_000)
})
