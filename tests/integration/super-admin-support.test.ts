import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cancelSubscriptionForSupport,
  changePlanForSupport,
  extendTrial,
  forceTenantStatus,
  reactivateTenant,
  TrialNotActiveError,
} from '@/modules/super-admin/support.service'
import { InvalidTransitionError } from '@/modules/billing/billing.errors'
import {
  cleanupAll,
  createTestStaffUser,
  createTestSystemAdmin,
  createTestTenant,
  ensureRoles,
  linkStaffToTenant,
} from '../helpers/tenant'

/**
 * Acciones de soporte del panel SuperAdmin (spec §9):
 *   - cada escritura emite su audit `support.*` con actor_type='system' y
 *     actor_id = uuid del system admin (NO el sentinel 0000…),
 *   - las transiciones forzadas respetan el FSM de lifecycle.service
 *     (transición inválida → error, sin audit).
 */

type PlansById = { predio: string; complejo: string; estadio: string }

let plans: PlansById

async function loadPlans(sql: Sql): Promise<PlansById> {
  const rows = await sql<{ id: string; slug: string }[]>`SELECT id, slug FROM plans`
  const map: Record<string, string> = {}
  for (const r of rows) map[r.slug] = r.id
  return { predio: map.predio!, complejo: map.complejo!, estadio: map.estadio! }
}

async function seedSubscription(
  sql: Sql,
  tenantId: string,
  status: string,
  planSlug: keyof PlansById,
  opts: {
    mpSubscriptionId?: string | null
    dunningStartedAt?: Date | null
    canceledAt?: Date | null
  } = {},
): Promise<void> {
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end,
      mp_subscription_id, dunning_started_at, canceled_at
    ) VALUES (
      ${tenantId}, ${plans[planSlug]}, 'monthly'::billing_cycle,
      ${status}::subscription_status,
      NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days',
      ${opts.mpSubscriptionId ?? null},
      ${opts.dunningStartedAt ? opts.dunningStartedAt.toISOString() : null}::timestamptz,
      ${opts.canceledAt ? opts.canceledAt.toISOString() : null}::timestamptz
    )
  `
  await sql`
    UPDATE tenants SET status = ${status}::tenant_status WHERE id = ${tenantId}
  `
}

async function seedTenantWithStaff(sql: Sql): Promise<string> {
  const tenant = await createTestTenant(sql)
  const staff = await createTestStaffUser(sql)
  await linkStaffToTenant(sql, tenant.id, staff.id)
  return tenant.id
}

type AuditRow = {
  action: string
  actor_type: string
  actor_id: string
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown> | null
}

/**
 * Gotcha conocido del repo (mp-webhook.test.ts:246): insertAuditLog via drizzle
 * deja el jsonb double-encoded → metadata puede volver como string. Se parsea
 * defensivamente para que los asserts trabajen sobre el objeto.
 */
function parseMeta(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  return typeof raw === 'string'
    ? (JSON.parse(raw) as Record<string, unknown>)
    : (raw as Record<string, unknown>)
}

async function fetchSupportAudits(sql: Sql, tenantId: string): Promise<AuditRow[]> {
  const rows = await sql<AuditRow[]>`
    SELECT action, actor_type, actor_id, resource_type, resource_id, metadata
    FROM audit_logs
    WHERE tenant_id = ${tenantId} AND action LIKE 'support.%'
    ORDER BY created_at
  `
  return rows.map((r) => ({ ...r, metadata: parseMeta(r.metadata) }))
}

async function fetchTenantStatus(sql: Sql, tenantId: string): Promise<string> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM tenants WHERE id = ${tenantId}
  `
  return rows[0]!.status
}

async function fetchSubRow(
  sql: Sql,
  tenantId: string,
): Promise<{ status: string; plan_id: string }> {
  const rows = await sql<{ status: string; plan_id: string }[]>`
    SELECT status, plan_id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]!
}

let systemAdminId: string
let mockGateway: MockGateway

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  plans = await loadPlans(sql)
}, 30_000)

afterAll(async () => {
  await closeSql()
})

beforeEach(async () => {
  const sql = getSql()
  const admin = await createTestSystemAdmin(sql)
  systemAdminId = admin.id
  mockGateway = new MockGateway()
})

afterEach(async () => {
  const sql = getSql()
  await sql`
    TRUNCATE TABLE notifications, audit_logs, tenant_subscriptions,
      tenant_staff_members, courts, tenants, system_admins, staff_users
    RESTART IDENTITY CASCADE
  `
})

// ─── extendTrial ─────────────────────────────────────────────────────────────

describe('extendTrial', () => {
  it('mueve trial_ends_at a max(now, fin actual) + days y audita support.tenant.trial_extended', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    // trialing por default; fijar un fin de trial futuro conocido (+5 días).
    await sql`
      UPDATE tenants SET trial_ends_at = NOW() + INTERVAL '5 days' WHERE id = ${tenantId}
    `

    const result = await extendTrial(tenantId, 10, systemAdminId)

    // Fin nuevo ≈ (now + 5d) + 10d = now + 15d (tolerancia 1 min).
    const expected = Date.now() + 15 * 24 * 60 * 60 * 1000
    expect(Math.abs(result.trialEndsAt.getTime() - expected)).toBeLessThan(60_000)

    const stored = await sql<{ trial_ends_at: Date | string }[]>`
      SELECT trial_ends_at FROM tenants WHERE id = ${tenantId}
    `
    const storedEnd = new Date(stored[0]!.trial_ends_at)
    expect(Math.abs(storedEnd.getTime() - expected)).toBeLessThan(60_000)

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.trial_extended')
    expect(audits[0]!.actor_type).toBe('system')
    expect(audits[0]!.actor_id).toBe(systemAdminId)
    expect(audits[0]!.resource_type).toBe('tenant')
    expect(audits[0]!.resource_id).toBe(tenantId)
    expect(audits[0]!.metadata).toMatchObject({ days: 10 })
  })

  it('usa NOW como base si el trial ya venció', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await sql`
      UPDATE tenants SET trial_ends_at = NOW() - INTERVAL '3 days' WHERE id = ${tenantId}
    `

    const result = await extendTrial(tenantId, 7, systemAdminId)

    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(result.trialEndsAt.getTime() - expected)).toBeLessThan(60_000)
  })

  it('rechaza tenants que no están en trialing y NO escribe audit', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio')

    await expect(extendTrial(tenantId, 10, systemAdminId)).rejects.toBeInstanceOf(
      TrialNotActiveError,
    )

    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })
})

// ─── forceTenantStatus ───────────────────────────────────────────────────────

describe('forceTenantStatus', () => {
  it('active → past_due: actualiza ambas tablas y audita support.tenant.status_forced', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio')

    const result = await forceTenantStatus(tenantId, 'past_due', systemAdminId)
    expect(result).toEqual({ from: 'active', to: 'past_due' })

    expect(await fetchTenantStatus(sql, tenantId)).toBe('past_due')
    expect((await fetchSubRow(sql, tenantId)).status).toBe('past_due')

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.status_forced')
    expect(audits[0]!.actor_type).toBe('system')
    expect(audits[0]!.actor_id).toBe(systemAdminId)
    expect(audits[0]!.metadata).toMatchObject({
      before: { status: 'active' },
      after: { status: 'past_due' },
    })
  })

  it('transición inválida (active → suspended) → InvalidTransitionError sin audit ni cambio', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio')

    await expect(
      forceTenantStatus(tenantId, 'suspended', systemAdminId),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })

  it('respeta los gates temporales del FSM: past_due → suspended con dunning < 7d falla sin audit', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'past_due', 'predio', {
      dunningStartedAt: new Date(), // recién arrancó el dunning — gate de 7d no cumplido
    })

    await expect(
      forceTenantStatus(tenantId, 'suspended', systemAdminId),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    expect(await fetchTenantStatus(sql, tenantId)).toBe('past_due')
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })

  it('past_due → active (recovery por soporte) limpia dunning y audita', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'past_due', 'predio', {
      dunningStartedAt: new Date(),
    })

    await forceTenantStatus(tenantId, 'active', systemAdminId)

    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    const rows = await sql<{ dunning_started_at: Date | null }[]>`
      SELECT dunning_started_at FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
    `
    expect(rows[0]!.dunning_started_at).toBeNull()

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.metadata).toMatchObject({ after: { status: 'active' } })
  })
})

// ─── reactivateTenant ────────────────────────────────────────────────────────

describe('reactivateTenant', () => {
  it('canceled → active y audita con actor system admin', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'canceled', 'predio', {
      canceledAt: new Date(),
    })

    const result = await reactivateTenant(tenantId, systemAdminId)
    expect(result.from).toBe('canceled')

    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    expect((await fetchSubRow(sql, tenantId)).status).toBe('active')

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.status_forced')
    expect(audits[0]!.actor_id).toBe(systemAdminId)
    expect(audits[0]!.metadata).toMatchObject({ reason: 'reactivated_by_support' })
  })
})

// ─── changePlanForSupport ────────────────────────────────────────────────────

describe('changePlanForSupport', () => {
  it('swapea el plan sin cobro, actualiza el preapproval MP y audita support.tenant.plan_changed', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio', {
      mpSubscriptionId: 'mp-preapp-test-1',
    })

    const result = await changePlanForSupport(
      tenantId,
      plans.complejo,
      systemAdminId,
      mockGateway,
    )
    expect(result).toEqual({ fromPlanId: plans.predio, toPlanId: plans.complejo })

    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.complejo)

    // Sin cobro hoy: cero preferences de proración; solo update del monto recurrente.
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(0)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
    expect(mockGateway.updatePreapprovalCalls[0]!.preapprovalId).toBe('mp-preapp-test-1')

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.plan_changed')
    expect(audits[0]!.actor_id).toBe(systemAdminId)
    expect(audits[0]!.metadata).toMatchObject({
      before: { planId: plans.predio },
      after: { planId: plans.complejo },
      mpAmountUpdated: true,
    })
  })

  it('bloquea el downgrade si el tenant supera el límite de canchas del plan destino', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'estadio')

    // Plan predio: max_courts 3 → con 4 canchas online el downgrade se bloquea.
    for (let i = 0; i < 4; i++) {
      await sql`
        INSERT INTO courts (tenant_id, name, capacity, status)
        VALUES (${tenantId}, ${`Cancha ${i + 1}`}, 10, 'online')
      `
    }

    await expect(
      changePlanForSupport(tenantId, plans.predio, systemAdminId, mockGateway),
    ).rejects.toMatchObject({ code: 'DOWNGRADE_BLOCKED' })

    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.estadio)
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })
})

// ─── cancelSubscriptionForSupport ────────────────────────────────────────────

describe('cancelSubscriptionForSupport', () => {
  it('cancela el preapproval MP, pasa a canceled y audita', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio', {
      mpSubscriptionId: 'mp-preapp-cancel-1',
    })

    await cancelSubscriptionForSupport(
      tenantId,
      'pedido del cliente por email',
      systemAdminId,
      mockGateway,
    )

    expect(await fetchTenantStatus(sql, tenantId)).toBe('canceled')
    expect((await fetchSubRow(sql, tenantId)).status).toBe('canceled')
    expect(mockGateway.cancelPreapprovalCalls).toContain('mp-preapp-cancel-1')

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.status_forced')
    expect(audits[0]!.actor_id).toBe(systemAdminId)
    expect(audits[0]!.metadata).toMatchObject({
      reason: 'pedido del cliente por email',
      after: { status: 'canceled' },
    })
  })
})
