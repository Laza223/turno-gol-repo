import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  closeSql,
  getDb,
  getSql,
  withTenantContext,
} from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import {
  cancel as billingCancel,
  downgrade as billingDowngrade,
  getSubscriptionState,
  handleUpgradeApproved,
  reactivate as billingReactivate,
  subscribe as billingSubscribe,
  upgrade as billingUpgrade,
} from '@/modules/billing/billing.service'
import {
  onPaymentApproved,
  onPaymentRejected,
} from '@/modules/billing/dunning.service'
import {
  transitionTrialingToActive,
  transitionToCanceled,
} from '@/modules/billing/lifecycle.service'
import {
  DowngradeBlockedError,
  InvalidTransitionError,
  ReactivateNotAllowedError,
} from '@/modules/billing/billing.errors'
import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'
import { runDataRetentionCleanup } from '@/shared/jobs/workers/data-retention-cleanup.worker'
import {
  cleanupAll,
  createTestStaffUser,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'
import type { Sql } from 'postgres'

type PlansById = { predio: string; complejo: string; estadio: string }

let plans: PlansById

async function loadPlans(sql: Sql): Promise<PlansById> {
  const rows = await sql<{ id: string; slug: string }[]>`
    SELECT id, slug FROM plans
  `
  const map: Record<string, string> = {}
  for (const r of rows) map[r.slug] = r.id
  return {
    predio: map.predio!,
    complejo: map.complejo!,
    estadio: map.estadio!,
  }
}

async function seedSubscription(
  sql: Sql,
  tenantId: string,
  status: string,
  planSlug: 'predio' | 'complejo' | 'estadio',
  opts: {
    billingCycle?: 'monthly' | 'annual'
    currentPeriodStart?: Date
    currentPeriodEnd?: Date
    mpSubscriptionId?: string | null
    dunningStartedAt?: Date | null
    canceledAt?: Date | null
    scheduledDeletionAt?: Date | null
  } = {},
): Promise<void> {
  const planId = plans[planSlug]
  const start = (opts.currentPeriodStart ?? new Date('2027-04-01T00:00:00Z')).toISOString()
  const end = (opts.currentPeriodEnd ?? new Date('2027-05-01T00:00:00Z')).toISOString()
  const dunningStartedAt = opts.dunningStartedAt ? opts.dunningStartedAt.toISOString() : null
  const canceledAt = opts.canceledAt ? opts.canceledAt.toISOString() : null
  const scheduledDeletionAt = opts.scheduledDeletionAt
    ? opts.scheduledDeletionAt.toISOString()
    : null

  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end,
      mp_subscription_id, dunning_started_at,
      canceled_at, scheduled_deletion_at
    ) VALUES (
      ${tenantId}, ${planId}, ${opts.billingCycle ?? 'monthly'}::billing_cycle,
      ${status}::subscription_status,
      ${start}::timestamptz, ${end}::timestamptz,
      ${opts.mpSubscriptionId ?? null},
      ${dunningStartedAt}::timestamptz,
      ${canceledAt}::timestamptz,
      ${scheduledDeletionAt}::timestamptz
    )
  `
  await sql`
    UPDATE tenants
    SET status = ${status}::tenant_status,
        scheduled_deletion_at = ${scheduledDeletionAt}::timestamptz
    WHERE id = ${tenantId}
  `
}

async function seedActiveTenant(
  sql: Sql,
  planSlug: 'predio' | 'complejo' | 'estadio' = 'predio',
  opts: {
    currentPeriodStart?: Date
    currentPeriodEnd?: Date
    mpSubscriptionId?: string
  } = {},
): Promise<{ tenantId: string; staffId: string }> {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  await seedSubscription(sql, tenant.id, 'active', planSlug, {
    ...opts,
    mpSubscriptionId: opts.mpSubscriptionId ?? `mp-preapp-test-${tenant.id}`,
  })
  return { tenantId: tenant.id, staffId: staff.id }
}

async function fetchSubStatus(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.status
}

async function fetchTenantStatus(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM tenants WHERE id = ${tenantId}
  `
  return rows[0]!.status
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  plans = await loadPlans(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

let mockGateway: MockGateway

beforeEach(() => {
  mockGateway = new MockGateway()
  setBillingGateway(mockGateway)
})

afterEach(async () => {
  setBillingGateway(null)
  const sql = getSql()
  await sql`TRUNCATE TABLE notifications, audit_logs, tenant_subscriptions, tenant_staff_members, courts, tenants, staff_users, processed_webhooks RESTART IDENTITY CASCADE`
})

// ─── Lifecycle FSM (legal + illegal transitions) ────────────────────────────

describe('lifecycle FSM', () => {
  it('trialing → active (legal)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedSubscription(sql, tenant.id, 'trialing', 'predio')

    await withTenantContext(tenant.id, async (tx) => {
      await transitionTrialingToActive(
        tenant.id,
        new Date('2027-04-01T00:00:00Z'),
        new Date('2027-05-01T00:00:00Z'),
        tx,
      )
    })

    expect(await fetchSubStatus(sql, tenant.id)).toBe('active')
    expect(await fetchTenantStatus(sql, tenant.id)).toBe('active')
  })

  it('trialing → suspended (illegal) throws InvalidTransitionError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedSubscription(sql, tenant.id, 'trialing', 'predio')

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await transitionToCanceled(tenant.id, 'test', tx)
        // valid above; now try double-cancel which is invalid
        await transitionToCanceled(tenant.id, 'test', tx)
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('canceled → blocked sweep when period_end < NOW', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql)

    // Cancel
    await withTenantContext(tenantId, async (tx) => {
      await transitionToCanceled(tenantId, 'too expensive', tx)
    })
    expect(await fetchTenantStatus(sql, tenantId)).toBe('canceled')

    // Force period_end in the past so sweep fires.
    await sql`
      UPDATE tenant_subscriptions SET current_period_end = NOW() - INTERVAL '1 day'
      WHERE tenant_id = ${tenantId}
    `

    await runDunningSweep()

    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')
    const rows = await sql<{ scheduled_deletion_at: Date | null }[]>`
      SELECT scheduled_deletion_at FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.scheduled_deletion_at).not.toBeNull()
  })
})

// ─── Test A: 3 webhook payment.rejected → blocked → churned ────────────────

describe('Test A — dunning escalation drives blocked → churned', () => {
  it('rejected → past_due; sweep at d7 → suspended; d14 → blocked; d90 → churned', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql)

    // Rejected webhook
    await withTenantContext(tenantId, async (tx) => {
      await onPaymentRejected(
        tenantId,
        'mp-evt-1',
        'subscription_authorized_payment',
        { test: 1 },
        new Date(),
        tx,
      )
    })
    expect(await fetchTenantStatus(sql, tenantId)).toBe('past_due')

    // Force dunning_started_at to 7d ago + sweep → suspended
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '7 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('suspended')

    // Force 14d + sweep → blocked
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '14 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')

    // Force 90d + sweep → churned, scheduled_deletion_at ≈ NOW + 7d
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '90 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('churned')
    const rows = await sql<{ scheduled_deletion_at: Date | string | null }[]>`
      SELECT scheduled_deletion_at FROM tenants WHERE id = ${tenantId}
    `
    const delAtRaw = rows[0]!.scheduled_deletion_at
    expect(delAtRaw).not.toBeNull()
    const delAt = new Date(delAtRaw as unknown as string)
    const inDays = (delAt.getTime() - Date.now()) / 86_400_000
    expect(inDays).toBeGreaterThan(6.5)
    expect(inDays).toBeLessThan(7.5)
  })
})

// ─── Test B: upgrade mid-period → correct proration ───────────────────────

describe('Test B — upgrade Predio → Complejo proration', () => {
  it('day 15 of 30 → proration = 1_350_000 cents', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio', {
      currentPeriodStart: new Date('2027-04-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    const result = await withTenantContext(tenantId, async (tx) => {
      return billingUpgrade(
        tenantId,
        plans.complejo,
        mockGateway,
        tx,
        new Date('2027-04-16T00:00:00Z'),
      )
    })

    expect(result.prorationAmount).toBe(1_350_000)
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(1)
    expect(mockGateway.saasUpgradePreferenceCalls[0]!.amount).toBe(1_350_000)

    // Simulate webhook: upgrade approved → billing.handleUpgradeApproved
    await withTenantContext(tenantId, async (tx) => {
      await handleUpgradeApproved(tenantId, plans.complejo, mockGateway, tx)
    })

    expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
    expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(7_400_000)

    const subRows = await sql<{ plan_id: string; pending_plan_change: string | null }[]>`
      SELECT plan_id, pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(subRows[0]!.plan_id).toBe(plans.complejo)
    expect(subRows[0]!.pending_plan_change).toBeNull()
  })
})

// ─── Test C: voluntary cancel happy path ───────────────────────────────────

describe('Test C — voluntary cancel', () => {
  it('cancel → preapproval canceled, period_end intact; sweep at end → blocked +67d', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio', {
      currentPeriodEnd: new Date(Date.now() + 86_400_000), // tomorrow
    })

    await withTenantContext(tenantId, async (tx) => {
      await billingCancel(tenantId, 'Muy caro', mockGateway, tx)
    })

    expect(mockGateway.cancelPreapprovalCalls).toHaveLength(1)
    expect(await fetchTenantStatus(sql, tenantId)).toBe('canceled')

    // Period unchanged
    const rows = await sql<{ current_period_end: Date | string }[]>`
      SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.getTime()).toBeGreaterThan(Date.now())

    // Force period_end in the past then sweep
    await sql`
      UPDATE tenant_subscriptions SET current_period_end = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()

    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')
    const finalRows = await sql<{ scheduled_deletion_at: Date | string | null }[]>`
      SELECT scheduled_deletion_at FROM tenants WHERE id = ${tenantId}
    `
    const delAtRaw = finalRows[0]!.scheduled_deletion_at
    expect(delAtRaw).not.toBeNull()
    const delAt = new Date(delAtRaw as unknown as string)
    const inDays = (delAt.getTime() - Date.now()) / 86_400_000
    expect(inDays).toBeGreaterThan(66)
    expect(inDays).toBeLessThan(68)
  })
})

// ─── Test D: data retention sweep wipes child rows ─────────────────────────

describe('Test D — data retention cleanup', () => {
  it('churned with deletion_at past → child rows deleted, tenant anonymized', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'churned', 'predio', {
      scheduledDeletionAt: new Date(Date.now() - 86_400_000),
    })

    const courtRows = await sql<{ id: string }[]>`
      INSERT INTO courts (tenant_id, name, capacity)
      VALUES (${tenant.id}, 'Cancha Test', 10)
      RETURNING id
    `
    const courtId = courtRows[0]!.id
    await sql`
      INSERT INTO bookings (
        tenant_id, court_id, date, time_start, time_end,
        type, status, price_snapshot, deposit_amount, deposit_status, payment_method
      ) VALUES (
        ${tenant.id}, ${courtId}, '2027-05-01'::date, '10:00'::time, '11:00'::time,
        'spontaneous', 'completed', 800000, 0, 'not_required', NULL
      )
    `
    await sql`
      INSERT INTO notifications (tenant_id, recipient_type, recipient_id, channel, trigger_event, status, content)
      VALUES (${tenant.id}, 'tenant_owner', ${staff.id}, 'email', 'test', 'sent', '{}'::jsonb)
    `

    await runDataRetentionCleanup()

    const courtsAfter = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM courts WHERE tenant_id = ${tenant.id}`
    expect(courtsAfter[0]!.n).toBe(0)
    const bookingsAfter = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM bookings WHERE tenant_id = ${tenant.id}`
    expect(bookingsAfter[0]!.n).toBe(0)
    const notifsAfter = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM notifications WHERE tenant_id = ${tenant.id}`
    expect(notifsAfter[0]!.n).toBe(0)

    const tenantRows = await sql<{ status: string; name: string; mp_access_token: string | null }[]>`
      SELECT status, name, mp_access_token FROM tenants WHERE id = ${tenant.id}
    `
    expect(tenantRows[0]!.status).toBe('deleted')
    expect(tenantRows[0]!.name).toBe('[deleted]')
    expect(tenantRows[0]!.mp_access_token).toBeNull()
  })
})

// ─── Test E (service-level) — suspended blocks billing-mutating ops ────────

describe('Test E — suspended state rejects mutations', () => {
  it('upgrade rejected on suspended tenant', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'suspended', 'predio', {
      mpSubscriptionId: 'mp-test',
      dunningStartedAt: new Date(Date.now() - 7 * 86_400_000),
    })

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingUpgrade(tenant.id, plans.complejo, mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
  })

  it('subscription state still readable on suspended', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'suspended', 'predio')

    const state = await withTenantContext(tenant.id, async (tx) => {
      return getSubscriptionState(tenant.id, tx)
    })
    expect(state.status).toBe('suspended')
    expect(state.planSlug).toBe('predio')
  })
})

// ─── Test F — downgrade blocked by court count ────────────────────────────

describe('Test F — downgrade court-count gate', () => {
  it('Complejo with 5 courts → downgrade to Predio (max 3) throws DowngradeBlockedError', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'complejo')

    // 5 online courts
    for (let i = 0; i < 5; i += 1) {
      await sql`
        INSERT INTO courts (tenant_id, name, capacity, status)
        VALUES (${tenantId}, ${`Cancha ${i + 1}`}, 10, 'online')
      `
    }

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await billingDowngrade(tenantId, plans.predio, tx)
      }),
    ).rejects.toBeInstanceOf(DowngradeBlockedError)
  })

  it('Complejo with 3 courts → downgrade scheduled to predio at period_end', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'complejo', {
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    for (let i = 0; i < 3; i += 1) {
      await sql`
        INSERT INTO courts (tenant_id, name, capacity, status)
        VALUES (${tenantId}, ${`Cancha ${i + 1}`}, 10, 'online')
      `
    }

    const result = await withTenantContext(tenantId, async (tx) => {
      return billingDowngrade(tenantId, plans.predio, tx)
    })
    expect(result.targetPlanId).toBe(plans.predio)
    expect(result.appliesAt.toISOString()).toBe('2027-05-01T00:00:00.000Z')

    const rows = await sql<{ pending_plan_change: string; pending_change_at: Date | string }[]>`
      SELECT pending_plan_change, pending_change_at FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.pending_plan_change).toBe(plans.predio)
    const changeAt = new Date(rows[0]!.pending_change_at as unknown as string)
    expect(changeAt.toISOString()).toBe('2027-05-01T00:00:00.000Z')
  })
})

// ─── Subscribe + onPaymentApproved (trialing → active) ─────────────────────

describe('subscribe → first webhook activates', () => {
  it('subscribe stores preapproval; onPaymentApproved transitions trialing → active', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', 'predio')

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingSubscribe(tenant.id, plans.predio, 'monthly', mockGateway, tx)
    })

    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(4_700_000)

    const subRowsBefore = await sql<{
      mp_subscription_id: string | null
      status: string
    }[]>`
      SELECT mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(subRowsBefore[0]!.mp_subscription_id).toBe(result.preapprovalId)
    expect(subRowsBefore[0]!.status).toBe('trialing')

    await withTenantContext(tenant.id, async (tx) => {
      await onPaymentApproved(
        tenant.id,
        'mp-evt-activate-1',
        'subscription_authorized_payment',
        { test: 1 },
        new Date(),
        tx,
      )
    })

    expect(await fetchSubStatus(sql, tenant.id)).toBe('active')
    expect(await fetchTenantStatus(sql, tenant.id)).toBe('active')
  })
})

// ─── Reactivate from canceled before deletion ─────────────────────────────

describe('reactivate', () => {
  it('canceled with deletion_at in future → reactivate allowed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'canceled', 'predio', {
      mpSubscriptionId: 'mp-old',
      canceledAt: new Date(),
      scheduledDeletionAt: new Date(Date.now() + 30 * 86_400_000),
    })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingReactivate(tenant.id, plans.complejo, 'monthly', mockGateway, tx)
    })
    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
  })

  it('blocked → reactivate throws ReactivateNotAllowedError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'blocked', 'predio')

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingReactivate(tenant.id, plans.predio, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
  })
})
