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

  // NOTE (audit): el test anterior se llamaba "trialing → suspended (illegal)"
  // pero NO ejercitaba esa transición: hacía doble-cancel. Nombre mentiroso +
  // sin verificar estado final. Reescrito en dos tests honestos abajo.
  it('rechaza doble cancelación: la 2da transitionToCanceled lanza InvalidTransitionError y el estado queda en canceled', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await seedSubscription(sql, tenant.id, 'trialing', 'predio')

    // 1ra cancelación (legal: trialing → canceled), commiteada en su propia tx.
    await withTenantContext(tenant.id, async (tx) => {
      await transitionToCanceled(tenant.id, 'primera', tx)
    })
    expect(await fetchSubStatus(sql, tenant.id)).toBe('canceled')

    // 2da cancelación sobre un sub ya canceled: 0 filas afectadas → error.
    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await transitionToCanceled(tenant.id, 'segunda', tx)
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    // Estado y razón quedan intactos de la PRIMERA cancelación (no sobrescritos).
    const rows = await sql<{ status: string; cancellation_reason: string }[]>`
      SELECT status, cancellation_reason FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(rows[0]!.status).toBe('canceled')
    expect(rows[0]!.cancellation_reason).toBe('primera')
  })

  it('rechaza transición ilegal: activar un sub que no está en trialing lanza InvalidTransitionError', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql) // ya active, no trialing

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await transitionTrialingToActive(
          tenantId,
          new Date('2027-04-01T00:00:00Z'),
          new Date('2027-05-01T00:00:00Z'),
          tx,
        )
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    // El sub sigue active, sin tocar (el guard de la FSM protege el estado).
    expect(await fetchSubStatus(sql, tenantId)).toBe('active')
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
  it('day 15 of 30 → proration = 1_500_000 cents', async () => {
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

    expect(result.prorationAmount).toBe(1_500_000)
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(1)
    expect(mockGateway.saasUpgradePreferenceCalls[0]!.amount).toBe(1_500_000)

    // Simulate webhook: upgrade approved → billing.handleUpgradeApproved
    await withTenantContext(tenantId, async (tx) => {
      await handleUpgradeApproved(tenantId, plans.complejo, mockGateway, tx)
    })

    expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
    expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(8_500_000)

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
    expect(await fetchSubStatus(sql, tenantId)).toBe('canceled')

    // Razón de cancelación persistida (efecto secundario observable).
    const reasonRows = await sql<{ cancellation_reason: string }[]>`
      SELECT cancellation_reason FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(reasonRows[0]!.cancellation_reason).toBe('Muy caro')

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

// ─── Test D: ELIMINADO (audit) ─────────────────────────────────────────────
// "data retention cleanup" era un SUBCONJUNTO estricto de
// tests/integration/data-retention-cleanup.test.ts, que verifica las 12 tablas
// hijas + caso negativo (sin scheduled_deletion_at) + idempotencia + email
// anonimizado + preservación del player cross-tenant (Ley 25.326). Test D solo
// chequeaba 3 tablas y no aportaba cobertura adicional. Cobertura migrada allá.

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

    // El rechazo es ANTES de tocar el gateway o la DB: sin preferencia creada,
    // sin pending_plan_change, plan intacto.
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(0)
    const rows = await sql<{ plan_id: string; pending_plan_change: string | null }[]>`
      SELECT plan_id, pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(rows[0]!.plan_id).toBe(plans.predio)
    expect(rows[0]!.pending_plan_change).toBeNull()
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
  it('Complejo with 5 courts → downgrade to Predio (max 2) throws DowngradeBlockedError', async () => {
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

    // El bloqueo NO debe dejar un downgrade pendiente: plan y pending intactos.
    const rows = await sql<{ plan_id: string; pending_plan_change: string | null }[]>`
      SELECT plan_id, pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.plan_id).toBe(plans.complejo)
    expect(rows[0]!.pending_plan_change).toBeNull()
  })

  it('downgrade programado se APLICA en el sweep cuando pending_change_at venció', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'complejo', {
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })
    for (let i = 0; i < 2; i += 1) {
      await sql`
        INSERT INTO courts (tenant_id, name, capacity, status)
        VALUES (${tenantId}, ${`Cancha ${i + 1}`}, 10, 'online')
      `
    }

    await withTenantContext(tenantId, async (tx) => {
      await billingDowngrade(tenantId, plans.predio, tx)
    })

    // Forzar el vencimiento de pending_change_at y correr el sweep.
    await sql`
      UPDATE tenant_subscriptions SET pending_change_at = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()

    const rows = await sql<{ plan_id: string; pending_plan_change: string | null; pending_change_at: Date | null }[]>`
      SELECT plan_id, pending_plan_change, pending_change_at
      FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.plan_id).toBe(plans.predio) // plan efectivamente cambiado
    expect(rows[0]!.pending_plan_change).toBeNull()
    expect(rows[0]!.pending_change_at).toBeNull()
    expect(await fetchSubStatus(sql, tenantId)).toBe('active') // sigue activo
  })

  it('Complejo with 2 courts → downgrade scheduled to predio at period_end', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'complejo', {
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    for (let i = 0; i < 2; i += 1) {
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
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(5_500_000)

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
    // Reactivar al plan complejo → preapproval por el monto mensual de complejo.
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(8_500_000)

    // DB: plan y nuevo mp_subscription_id seteados; status SIGUE canceled
    // (recién se activa con el primer onPaymentApproved, no acá).
    const rows = await sql<{ plan_id: string; mp_subscription_id: string | null; status: string }[]>`
      SELECT plan_id, mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(rows[0]!.plan_id).toBe(plans.complejo)
    expect(rows[0]!.mp_subscription_id).toBe(result.preapprovalId)
    expect(rows[0]!.mp_subscription_id).not.toBe('mp-old') // ya no es el viejo
    expect(rows[0]!.status).toBe('canceled')
  })

  it('canceled con scheduled_deletion_at VENCIDO → reactivate lanza ReactivateNotAllowedError', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'canceled', 'predio', {
      mpSubscriptionId: 'mp-old',
      canceledAt: new Date(),
      scheduledDeletionAt: new Date(Date.now() - 86_400_000), // ayer (vencido)
    })

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingReactivate(tenant.id, plans.predio, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)

    // Sin preapproval creado: rechazo antes de tocar el gateway.
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })

  // ENS-20: blocked/suspended pasan a ser elegibles para reactivate() — doc4 §2
  // los clasifica como "Re-activación"/"Reintento manual" respectivamente, el
  // mismo botón de "pagar ahora" que ya tenían canceled/churned (ver
  // billing.service.ts). Reemplaza el test viejo "blocked → throws".
  it('blocked → reactivate crea un preapproval nuevo (no lanza)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'blocked', 'predio', { mpSubscriptionId: 'mp-old' })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingReactivate(tenant.id, plans.complejo, 'monthly', mockGateway, tx)
    })

    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    const rows = await sql<{ plan_id: string; mp_subscription_id: string | null; status: string }[]>`
      SELECT plan_id, mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(rows[0]!.plan_id).toBe(plans.complejo)
    expect(rows[0]!.mp_subscription_id).not.toBe('mp-old')
    expect(rows[0]!.status).toBe('blocked') // reactivate() no transiciona: eso lo hace onPaymentApproved
  })

  it('suspended → reactivate crea un preapproval nuevo (no lanza)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'suspended', 'predio', { mpSubscriptionId: 'mp-old' })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingReactivate(tenant.id, plans.predio, 'monthly', mockGateway, tx)
    })

    expect(result.checkoutUrl).toContain('mp.test')
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
  })

  it('past_due → reactivate sigue lanzando ReactivateNotAllowedError (MP ya reintenta solo)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'past_due', 'predio')

    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await billingReactivate(tenant.id, plans.predio, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })
})

// ─── GAP (audit): recovery past_due → active vía pago aprobado ──────────────

describe('dunning recovery — pago aprobado durante past_due', () => {
  it('past_due → active: limpia dunning_started_at y extiende el período', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio', {
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    // Rechazo lleva a past_due con dunning anclado.
    await withTenantContext(tenantId, async (tx) => {
      await onPaymentRejected(
        tenantId,
        'mp-evt-reject-recovery',
        'subscription_authorized_payment',
        { test: 1 },
        new Date(),
        tx,
      )
    })
    expect(await fetchSubStatus(sql, tenantId)).toBe('past_due')

    // Pago aprobado (evento distinto) recupera a active.
    await withTenantContext(tenantId, async (tx) => {
      await onPaymentApproved(
        tenantId,
        'mp-evt-approve-recovery',
        'subscription_authorized_payment',
        { test: 1 },
        new Date('2027-04-20T00:00:00Z'),
        tx,
      )
    })

    expect(await fetchSubStatus(sql, tenantId)).toBe('active')
    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    const rows = await sql<{ dunning_started_at: Date | null; current_period_end: Date | string }[]>`
      SELECT dunning_started_at, current_period_end
      FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.dunning_started_at).toBeNull() // ancla de dunning limpiada
    // Mensual: período extendido un mes desde el 2027-05-01 previo → 2027-06-01.
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.toISOString()).toBe('2027-06-01T00:00:00.000Z')
  })
})

// ─── GAP (audit): ciclo de facturación ANUAL (todo el resto usa monthly) ────

describe('billing cycle anual', () => {
  it('subscribe anual usa price_annual y la activación extiende el período un año', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'trialing', 'predio', {
      billingCycle: 'annual',
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    const result = await withTenantContext(tenant.id, async (tx) => {
      return billingSubscribe(tenant.id, plans.predio, 'annual', mockGateway, tx)
    })
    expect(result.checkoutUrl).toContain('mp.test')
    // Predio anual = 4_400_000 centavos (NO el mensual 5_500_000).
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(4_400_000)
    expect(mockGateway.preapprovalCalls[0]!.frequency).toBe('annual')

    const cycleRows = await sql<{ billing_cycle: string }[]>`
      SELECT billing_cycle FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(cycleRows[0]!.billing_cycle).toBe('annual')

    // Primer pago aprobado activa y extiende UN AÑO (no un mes).
    await withTenantContext(tenant.id, async (tx) => {
      await onPaymentApproved(
        tenant.id,
        'mp-evt-annual-activate',
        'subscription_authorized_payment',
        { test: 1 },
        new Date('2027-04-15T00:00:00Z'),
        tx,
      )
    })
    expect(await fetchSubStatus(sql, tenant.id)).toBe('active')
    const rows = await sql<{ current_period_end: Date | string }[]>`
      SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.toISOString()).toBe('2028-05-01T00:00:00.000Z')
  })
})

// ─── GAP (audit): subscribe sólo es legal desde trialing ───────────────────

describe('subscribe guard de estado', () => {
  it('subscribe sobre un sub active lanza ReactivateNotAllowedError y no crea preapproval', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql)

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await billingSubscribe(tenantId, plans.predio, 'monthly', mockGateway, tx)
      }),
    ).rejects.toBeInstanceOf(ReactivateNotAllowedError)
    expect(mockGateway.preapprovalCalls).toHaveLength(0)
  })
})

// ─── GAP (audit): handleUpgradeApproved es no-op ante evento stale ──────────

describe('handleUpgradeApproved guard de idempotencia/stale', () => {
  it('sin upgrade pendiente → no-op: no actualiza preapproval ni cambia el plan', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio')

    // Llega un webhook de upgrade aprobado a complejo SIN que exista
    // pending_plan_change (evento duplicado/stale tras un upgrade ya aplicado).
    await withTenantContext(tenantId, async (tx) => {
      await handleUpgradeApproved(tenantId, plans.complejo, mockGateway, tx)
    })

    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
    const rows = await sql<{ plan_id: string }[]>`
      SELECT plan_id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.plan_id).toBe(plans.predio) // plan NO cambió
  })
})
