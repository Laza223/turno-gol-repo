import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'
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

  // Setup: tenant in past_due with dunning_started_at = 8 days ago (eligible → suspended)
  await s`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end,
      dunning_started_at, last_payment_failed_at
    ) VALUES (
      ${tenant.id},
      (SELECT id FROM plans WHERE slug = 'predio' LIMIT 1),
      'monthly'::billing_cycle,
      'past_due'::subscription_status,
      NOW() - INTERVAL '40 days',
      NOW() - INTERVAL '10 days',
      NOW() - INTERVAL '8 days',
      NOW() - INTERVAL '8 days'
    )
  `
  await s`UPDATE tenants SET status = 'past_due'::tenant_status WHERE id = ${tenant.id}`
}, 30_000)

afterAll(async () => closeSql())

describe('runDunningSweep idempotency', () => {
  it('sweep runs N=5 times → tenant transitions exactly once to suspended', async () => {
    for (let i = 0; i < 5; i++) {
      await runDunningSweep()
    }

    const s = getSql()
    const rows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    // Tenant should be 'suspended' (one transition) — not 'blocked' (would be after another 14d).
    expect(rows[0].status).toBe('suspended')

    const tenantRows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenant.id}
    `
    expect(tenantRows[0].status).toBe('suspended')
  }, 60_000)
})
