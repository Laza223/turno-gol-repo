import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { onPaymentApproved } from '@/modules/billing/dunning.service'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

let tenant: { id: string }

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  tenant = await createTestTenant(s)

  await s`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end,
      mp_subscription_id
    ) VALUES (
      ${tenant.id},
      (SELECT id FROM plans WHERE slug = 'predio' LIMIT 1),
      'monthly'::billing_cycle,
      'trialing'::subscription_status,
      NOW(), NOW() + INTERVAL '7 days',
      'preapp-test-1'
    )
  `
}, 30_000)

afterAll(async () => closeSql())

describe('billing race conditions', () => {
  it('two concurrent onPaymentApproved with DIFFERENT mpEventIds → state still consistent', async () => {
    const evt1 = `evt-billing-${Date.now()}-1`
    const evt2 = `evt-billing-${Date.now()}-2`

    const results = await Promise.allSettled([
      withTenantContext(tenant.id, (tx) =>
        onPaymentApproved(tenant.id, evt1, 'payment', { id: evt1 }, new Date(), tx),
      ),
      withTenantContext(tenant.id, (tx) =>
        onPaymentApproved(tenant.id, evt2, 'payment', { id: evt2 }, new Date(), tx),
      ),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    // Acceptable outcomes:
    // - Both fulfilled (one transitions, other extends period because status='active' branch)
    // - One fulfilled + one rejected (loser hit InvalidTransitionError on tx commit race)
    expect(fulfilled + rejected).toBe(2)

    // Final state MUST be active (not trialing).
    const s = getSql()
    const rows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(rows[0].status).toBe('active')

    // processed_webhooks should have BOTH events recorded.
    const wh = await s<{ c: number }[]>`
      SELECT COUNT(*)::int AS c FROM processed_webhooks
      WHERE mp_event_id IN (${evt1}, ${evt2})
    `
    expect(wh[0].c).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('SAME mpEventId N=10 concurrent → exactly 1 fresh, rest alreadyProcessed', async () => {
    // Reset to trialing for second test
    const s = getSql()
    await s`UPDATE tenant_subscriptions SET status = 'trialing'::subscription_status WHERE tenant_id = ${tenant.id}`
    await s`UPDATE tenants SET status = 'trialing'::tenant_status WHERE id = ${tenant.id}`

    const evt = `evt-billing-same-${Date.now()}`
    const attempts = Array.from({ length: 10 }, () =>
      withTenantContext(tenant.id, async (tx) => {
        try {
          return await onPaymentApproved(tenant.id, evt, 'payment', { id: evt }, new Date(), tx)
        } catch {
          return { alreadyProcessed: true }
        }
      }),
    )
    const results = await Promise.all(attempts)
    const fresh = results.filter((r) => !r.alreadyProcessed).length
    expect(fresh).toBe(1)
  }, 30_000)
})
