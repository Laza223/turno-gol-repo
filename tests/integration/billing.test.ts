import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { setBillingGateway } from '@/modules/billing/billing.gateway'
import {
  cancel as billingCancel,
  getBillingPayerEmail,
  setBillingPayerEmail,
  downgrade as billingDowngrade,
  getSubscriptionState,
  handleUpgradeApproved,
  reactivate as billingReactivate,
  subscribe as billingSubscribe,
  upgrade as billingUpgrade,
} from '@/modules/billing/billing.service'
import { onPaymentApproved, onPaymentRejected } from '@/modules/billing/dunning.service'
import {
  CANCELED_BLOCKED_DELETION_DAYS,
  CHURNED_DELETION_DAYS,
  transitionTrialingToActive,
  transitionToCanceled,
} from '@/modules/billing/lifecycle.service'
import {
  DowngradeBlockedError,
  InvalidTransitionError,
  ReactivateNotAllowedError,
  UpgradeAlreadyPendingError,
} from '@/modules/billing/billing.errors'
import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'
import {
  asApp,
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

async function fetchSubStatus(tenantId: string): Promise<string> {
  const rows = await asApp(
    tenantId,
    (tx) =>
      tx<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `,
  )
  return rows[0]!.status
}

// tenants es tabla GLOBAL sin RLS (no tiene tenant_id que aislar): se queda
// en el pool de siempre, no hay contexto de tenant que setear acá.
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

    expect(await fetchSubStatus(tenant.id)).toBe('active')
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
    expect(await fetchSubStatus(tenant.id)).toBe('canceled')

    // 2da cancelación sobre un sub ya canceled: 0 filas afectadas → error.
    await expect(
      withTenantContext(tenant.id, async (tx) => {
        await transitionToCanceled(tenant.id, 'segunda', tx)
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    // Estado y razón quedan intactos de la PRIMERA cancelación (no sobrescritos).
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ status: string; cancellation_reason: string }[]>`
        SELECT status, cancellation_reason FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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
    expect(await fetchSubStatus(tenantId)).toBe('active')
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
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ scheduled_deletion_at: Date | null }[]>`
        SELECT scheduled_deletion_at FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
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

    // Force 90d + sweep → churned, scheduled_deletion_at ≈ NOW + CHURNED_DELETION_DAYS
    await sql`
      UPDATE tenant_subscriptions SET dunning_started_at = NOW() - INTERVAL '90 days'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()
    expect(await fetchTenantStatus(sql, tenantId)).toBe('churned')
    // tenants es tabla GLOBAL sin RLS: se queda en el pool de siempre.
    const rows = await sql<{ scheduled_deletion_at: Date | string | null }[]>`
      SELECT scheduled_deletion_at FROM tenants WHERE id = ${tenantId}
    `
    const delAtRaw = rows[0]!.scheduled_deletion_at
    expect(delAtRaw).not.toBeNull()
    const delAt = new Date(delAtRaw as unknown as string)
    const inDays = (delAt.getTime() - Date.now()) / 86_400_000
    expect(inDays).toBeGreaterThan(CHURNED_DELETION_DAYS - 0.5)
    expect(inDays).toBeLessThan(CHURNED_DELETION_DAYS + 0.5)
  })
})

// ─── Test B: upgrade mid-period → correct proration ───────────────────────

describe('Test B — upgrade Predio → Complejo proration', () => {
  // Derivación, para que el número no sea mágico: Complejo $99.000 − Predio
  // $63.000 = $36.000 de diferencia mensual (migr. 071); quedan 15 de los 30
  // días del período → $18.000 = 1_800_000 centavos.
  // Antes de la 071 la diferencia era $85.000 − $55.000 = $30.000 → 1_500_000.
  it('day 15 of 30 → proration = 1_800_000 cents', async () => {
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

    expect(result.prorationAmount).toBe(1_800_000)
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(1)
    expect(mockGateway.saasUpgradePreferenceCalls[0]!.amount).toBe(1_800_000)

    // Simulate webhook: upgrade approved → billing.handleUpgradeApproved
    await withTenantContext(tenantId, async (tx) => {
      await handleUpgradeApproved(tenantId, plans.complejo, mockGateway, tx)
    })

    expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
    expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(9_900_000)

    const subRows = await asApp(
      tenantId,
      (tx) =>
        tx<{ plan_id: string; pending_plan_change: string | null }[]>`
        SELECT plan_id, pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(subRows[0]!.plan_id).toBe(plans.complejo)
    expect(subRows[0]!.pending_plan_change).toBeNull()
  })
})

// ─── Test B2 (01-billing-upgrade-dedup): segunda upgrade() con una ya
// pendiente se rechaza, no pisa el pending_plan_change ni crea otra
// preferencia MP ────────────────────────────────────────────────────────────

describe('Test B2 — upgrade() con un cambio ya pendiente', () => {
  it('segunda llamada a upgrade() → UpgradeAlreadyPendingError, sin pisar pending_plan_change ni tocar MP de nuevo', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio', {
      currentPeriodStart: new Date('2027-04-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-05-01T00:00:00Z'),
    })

    await withTenantContext(tenantId, async (tx) => {
      await billingUpgrade(
        tenantId,
        plans.complejo,
        mockGateway,
        tx,
        new Date('2027-04-16T00:00:00Z'),
      )
    })
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(1)

    await expect(
      withTenantContext(tenantId, async (tx) => {
        await billingUpgrade(
          tenantId,
          plans.estadio,
          mockGateway,
          tx,
          new Date('2027-04-20T00:00:00Z'),
        )
      }),
    ).rejects.toBeInstanceOf(UpgradeAlreadyPendingError)

    // Sin segunda preferencia MP; `pending_plan_change` sigue apuntando al
    // upgrade original (complejo), no al estadio del intento rechazado.
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(1)
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ pending_plan_change: string | null }[]>`
        SELECT pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(rows[0]!.pending_plan_change).toBe(plans.complejo)
  })
})

// ─── Test C: voluntary cancel happy path ───────────────────────────────────

describe('Test C — voluntary cancel', () => {
  it('cancel → preapproval canceled, period_end intact; sweep at end → blocked + CANCELED_BLOCKED_DELETION_DAYS', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio', {
      currentPeriodEnd: new Date(Date.now() + 86_400_000), // tomorrow
    })

    await withTenantContext(tenantId, async (tx) => {
      await billingCancel(tenantId, 'Muy caro', mockGateway, tx)
    })

    expect(mockGateway.cancelPreapprovalCalls).toHaveLength(1)
    expect(await fetchTenantStatus(sql, tenantId)).toBe('canceled')
    expect(await fetchSubStatus(tenantId)).toBe('canceled')

    // Razón de cancelación persistida (efecto secundario observable).
    const reasonRows = await asApp(
      tenantId,
      (tx) =>
        tx<{ cancellation_reason: string }[]>`
        SELECT cancellation_reason FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(reasonRows[0]!.cancellation_reason).toBe('Muy caro')

    // Period unchanged
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ current_period_end: Date | string }[]>`
        SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    const periodEnd = new Date(rows[0]!.current_period_end as unknown as string)
    expect(periodEnd.getTime()).toBeGreaterThan(Date.now())

    // Force period_end in the past then sweep
    await sql`
      UPDATE tenant_subscriptions SET current_period_end = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${tenantId}
    `
    await runDunningSweep()

    expect(await fetchTenantStatus(sql, tenantId)).toBe('blocked')
    // tenants es tabla GLOBAL sin RLS: se queda en el pool de siempre.
    const finalRows = await sql<{ scheduled_deletion_at: Date | string | null }[]>`
      SELECT scheduled_deletion_at FROM tenants WHERE id = ${tenantId}
    `
    const delAtRaw = finalRows[0]!.scheduled_deletion_at
    expect(delAtRaw).not.toBeNull()
    const delAt = new Date(delAtRaw as unknown as string)
    const inDays = (delAt.getTime() - Date.now()) / 86_400_000
    expect(inDays).toBeGreaterThan(CANCELED_BLOCKED_DELETION_DAYS - 1)
    expect(inDays).toBeLessThan(CANCELED_BLOCKED_DELETION_DAYS + 1)
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
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ plan_id: string; pending_plan_change: string | null }[]>`
        SELECT plan_id, pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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

    // El bloqueo NO debe dejar un downgrade pendiente: plan y pending intactos.
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ plan_id: string; pending_plan_change: string | null }[]>`
        SELECT plan_id, pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
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

    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<
          { plan_id: string; pending_plan_change: string | null; pending_change_at: Date | null }[]
        >`
        SELECT plan_id, pending_plan_change, pending_change_at
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(rows[0]!.plan_id).toBe(plans.predio) // plan efectivamente cambiado
    expect(rows[0]!.pending_plan_change).toBeNull()
    expect(rows[0]!.pending_change_at).toBeNull()
    expect(await fetchSubStatus(tenantId)).toBe('active') // sigue activo
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

    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ pending_plan_change: string; pending_change_at: Date | string }[]>`
        SELECT pending_plan_change, pending_change_at FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
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
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(6_300_000)

    const subRowsBefore = await asApp(
      tenant.id,
      (tx) =>
        tx<
          {
            mp_subscription_id: string | null
            status: string
          }[]
        >`
        SELECT mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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

    expect(await fetchSubStatus(tenant.id)).toBe('active')
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
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(9_900_000)

    // DB: plan y nuevo mp_subscription_id seteados; status SIGUE canceled
    // (recién se activa con el primer onPaymentApproved, no acá).
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ plan_id: string; mp_subscription_id: string | null; status: string }[]>`
        SELECT plan_id, mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ plan_id: string; mp_subscription_id: string | null; status: string }[]>`
        SELECT plan_id, mp_subscription_id, status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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
    expect(await fetchSubStatus(tenantId)).toBe('past_due')

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

    expect(await fetchSubStatus(tenantId)).toBe('active')
    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ dunning_started_at: Date | null; current_period_end: Date | string }[]>`
        SELECT dunning_started_at, current_period_end
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
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
    // Predio anual = 5_040_000 centavos (NO el mensual 6_300_000).
    expect(mockGateway.preapprovalCalls).toHaveLength(1)
    expect(mockGateway.preapprovalCalls[0]!.amount).toBe(5_040_000)
    expect(mockGateway.preapprovalCalls[0]!.frequency).toBe('annual')

    const cycleRows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ billing_cycle: string }[]>`
        SELECT billing_cycle FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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
    expect(await fetchSubStatus(tenant.id)).toBe('active')
    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ current_period_end: Date | string }[]>`
        SELECT current_period_end FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
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
    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<{ plan_id: string }[]>`
        SELECT plan_id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(rows[0]!.plan_id).toBe(plans.predio) // plan NO cambió
  })
})

// ─── Residual B5: pending_plan_change stale sobrevive cancel→reactivate ────
// cancel() y reactivate() no limpiaban `pending_plan_change`/`pending_change_at`.
// Un upgrade pedido y no confirmado (webhook en vuelo) dejaba el pending vivo
// a través de un ciclo cancel→reactivate con OTRO plan; cuando el webhook
// tardío llegaba, `handleUpgradeApproved` volvía a matchear su CAS-WHERE
// (`status='active' AND pending_plan_change=target`) y reaplicaba el plan
// viejo + cobraba de más en MP. Fix: limpiar pending en los dos puntos que no
// lo hacían — así el CAS tardío ve 0 filas y no toca nada.

describe('cancel() limpia pending_plan_change stale (residuo B5)', () => {
  it('sub active con upgrade pendiente → tras cancel(), pending_plan_change y pending_change_at quedan NULL', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio', {
      mpSubscriptionId: 'mp-cancel-pending-test',
    })

    // Simula un upgrade pedido y no confirmado (pending_change_at NULL, como
    // deja `upgrade()` real — ver comentario en billing.service.ts:upgrade).
    await sql`
      UPDATE tenant_subscriptions
      SET pending_plan_change = ${plans.complejo}, pending_change_at = NULL
      WHERE tenant_id = ${tenantId}
    `

    await withTenantContext(tenantId, async (tx) => {
      await billingCancel(tenantId, 'me arrepentí', mockGateway, tx)
    })

    const rows = await asApp(
      tenantId,
      (tx) =>
        tx<
          {
            pending_plan_change: string | null
            pending_change_at: Date | null
          }[]
        >`
        SELECT pending_plan_change, pending_change_at
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(rows[0]!.pending_plan_change).toBeNull()
    expect(rows[0]!.pending_change_at).toBeNull()
  })
})

describe('reactivate() limpia pending_plan_change stale (residuo B5)', () => {
  it('sub canceled con downgrade pendiente stale → tras reactivate(), pending_plan_change y pending_change_at quedan NULL', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const staff = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, staff.id)
    await seedSubscription(sql, tenant.id, 'canceled', 'predio', {
      mpSubscriptionId: 'mp-old-pending',
      canceledAt: new Date(),
      scheduledDeletionAt: new Date(Date.now() + 30 * 86_400_000),
    })
    // Simula un downgrade programado stale (pending_change_at en el pasado,
    // como dejaría un `downgrade()` cuyo period_end ya venció sin que el
    // sweep lo haya limpiado todavía).
    await sql`
      UPDATE tenant_subscriptions
      SET pending_plan_change = ${plans.estadio}, pending_change_at = NOW() - INTERVAL '1 hour'
      WHERE tenant_id = ${tenant.id}
    `

    await withTenantContext(tenant.id, async (tx) => {
      await billingReactivate(tenant.id, plans.complejo, 'monthly', mockGateway, tx)
    })

    const rows = await asApp(
      tenant.id,
      (tx) =>
        tx<
          {
            pending_plan_change: string | null
            pending_change_at: Date | null
          }[]
        >`
        SELECT pending_plan_change, pending_change_at
        FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
      `,
    )
    expect(rows[0]!.pending_plan_change).toBeNull()
    expect(rows[0]!.pending_change_at).toBeNull()
  })
})

describe('B5 residual — extremo a extremo: upgrade pendiente + cancel + reactivate a otro plan', () => {
  it('el webhook tardío de la upgrade original NO reaplica el plan viejo ni toca MP', async () => {
    const sql = getSql()
    const { tenantId } = await seedActiveTenant(sql, 'predio')

    // 1. El dueño pide upgrade a estadio → pending_plan_change='estadio'.
    await withTenantContext(tenantId, async (tx) => {
      await billingUpgrade(tenantId, plans.estadio, mockGateway, tx)
    })
    const pendingRows = await asApp(
      tenantId,
      (tx) =>
        tx<{ pending_plan_change: string | null }[]>`
        SELECT pending_plan_change FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(pendingRows[0]!.pending_plan_change).toBe(plans.estadio)

    // 2. Antes de que llegue el webhook, el dueño cancela.
    await withTenantContext(tenantId, async (tx) => {
      await billingCancel(tenantId, 'me arrepentí', mockGateway, tx)
    })

    // 3. Y reactiva con un plan DISTINTO (complejo, no el 'estadio' pendiente).
    await withTenantContext(tenantId, async (tx) => {
      await billingReactivate(tenantId, plans.complejo, 'monthly', mockGateway, tx)
    })

    // 4. Llega el webhook tardío de la upgrade original (a estadio).
    await withTenantContext(tenantId, async (tx) => {
      await handleUpgradeApproved(tenantId, plans.estadio, mockGateway, tx)
    })

    // Con el fix (cancel limpia pending): el CAS-WHERE de handleUpgradeApproved
    // (`status='active' AND pending_plan_change='estadio'`) no matchea → 0
    // filas → nunca toca MP ni pisa el plan de la reactivación.
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
    const finalRows = await asApp(
      tenantId,
      (tx) =>
        tx<{ plan_id: string }[]>`
        SELECT plan_id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
      `,
    )
    expect(finalRows[0]!.plan_id).toBe(plans.complejo)
  })
})

// ─── payer_email de MercadoPago (migr. 078) ────────────────────────────────

describe('con qué cuenta de MercadoPago paga el complejo', () => {
  it('subscribe cobra al email declarado; sin declarar, al del dueño (admin, no el encargado)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql, { email: `owner-${tenant.id}@staff.local` })
    const manager = await createTestStaffUser(sql, { email: `manager-${tenant.id}@staff.local` })
    // El encargado se linkea PRIMERO: sin el ORDER BY del LATERAL, las
    // subqueries de loadTenantOwner podían devolver a este y cobrarle a él.
    await linkStaffToTenant(sql, tenant.id, manager.id, 'manager')
    await linkStaffToTenant(sql, tenant.id, owner.id, 'admin')
    await seedSubscription(sql, tenant.id, 'trialing', 'predio')

    const before = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    expect(before.override).toBeNull()
    expect(before.ownerEmail).toBe(owner.email)
    expect(before.effective).toBe(owner.email)

    await withTenantContext(tenant.id, (tx) =>
      billingSubscribe(tenant.id, plans.predio, 'monthly', mockGateway, tx),
    )
    expect(mockGateway.preapprovalCalls[0]!.payerEmail).toBe(owner.email)

    const mpEmail = 'cuenta.mp@gmail.com'
    const { previous } = await withTenantContext(tenant.id, (tx) =>
      setBillingPayerEmail(tenant.id, mpEmail, tx),
    )
    expect(previous).toBeNull()

    const after = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    expect(after.override).toBe(mpEmail)
    expect(after.effective).toBe(mpEmail)
    expect(after.ownerEmail).toBe(owner.email)

    // Re-subscribe durante el trial: el segundo preapproval ya va al email
    // declarado, que es el flujo que destrabó el caso real de producción.
    await withTenantContext(tenant.id, (tx) =>
      billingSubscribe(tenant.id, plans.predio, 'monthly', mockGateway, tx),
    )
    expect(mockGateway.preapprovalCalls[1]!.payerEmail).toBe(mpEmail)
  })

  it('vaciar el email vuelve al del dueño y devuelve el valor anterior para la auditoría', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    const owner = await createTestStaffUser(sql)
    await linkStaffToTenant(sql, tenant.id, owner.id)
    await seedSubscription(sql, tenant.id, 'trialing', 'predio')

    await withTenantContext(tenant.id, (tx) =>
      setBillingPayerEmail(tenant.id, 'cuenta.mp@gmail.com', tx),
    )
    const { previous } = await withTenantContext(tenant.id, (tx) =>
      setBillingPayerEmail(tenant.id, null, tx),
    )

    expect(previous).toBe('cuenta.mp@gmail.com')
    const state = await withTenantContext(tenant.id, (tx) => getBillingPayerEmail(tenant.id, tx))
    expect(state.override).toBeNull()
    expect(state.effective).toBe(owner.email)

    // El mismo UPDATE, pero con el ROL DE LA APP y RLS puestos (`asApp`): el
    // pool de `withTenantContext` corre con el DSN superusuario en local, así
    // que por sí solo no prueba que la policy deje escribir esta columna.
    // El CTE con FOR UPDATE es el que necesita, además del SELECT, el USING de
    // la policy de UPDATE.
    const asAppRows = await asApp(
      tenant.id,
      (tx) =>
        tx<{ previous: string | null }[]>`
        WITH prev AS (
          SELECT tenant_id, mp_payer_email
          FROM tenant_subscriptions
          WHERE tenant_id = ${tenant.id}
          FOR UPDATE
        )
        UPDATE tenant_subscriptions ts
        SET mp_payer_email = ${'otra.cuenta@gmail.com'},
            updated_at = NOW()
        FROM prev
        WHERE ts.tenant_id = prev.tenant_id
        RETURNING prev.mp_payer_email AS "previous"
      `,
    )
    expect(asAppRows).toHaveLength(1)
    expect(asAppRows[0]!.previous).toBeNull()
  })
})
