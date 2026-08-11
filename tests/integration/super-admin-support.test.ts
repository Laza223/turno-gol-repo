import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import {
  cancelSubscriptionForSupport,
  changePlanForSupport,
  extendTrial,
  forceTenantStatus,
  PlanAlreadyAssignedError,
  reactivateTenant,
  TenantNotFoundError,
  TrialNotActiveError,
  updateTenantSettingsForSupport,
} from '@/modules/super-admin/support.service'
import {
  InvalidTransitionError,
  PlanNotFoundError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
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

    // El valor persistido (no solo el return) debe usar NOW como base, no el
    // fin vencido (que daría now-3d+7d = now+4d). Si el branch max(now, end)
    // se rompiera, el stored caería fuera de la tolerancia y este assert falla.
    const stored = await sql<{ trial_ends_at: Date | string }[]>`
      SELECT trial_ends_at FROM tenants WHERE id = ${tenantId}
    `
    expect(Math.abs(new Date(stored[0]!.trial_ends_at).getTime() - expected)).toBeLessThan(60_000)

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.trial_extended')
    expect(audits[0]!.metadata).toMatchObject({ days: 7 })
  })

  it('extiende trial cuando trial_ends_at es NULL usando NOW como base', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    // createTestTenant no fija trial_ends_at → NULL. El branch `?? now` debe
    // anclar en NOW, no romper con NaN ni dejar la columna en NULL.
    await sql`UPDATE tenants SET trial_ends_at = NULL WHERE id = ${tenantId}`

    const result = await extendTrial(tenantId, 14, systemAdminId)

    const expected = Date.now() + 14 * 24 * 60 * 60 * 1000
    expect(Math.abs(result.trialEndsAt.getTime() - expected)).toBeLessThan(60_000)

    const stored = await sql<{ trial_ends_at: Date | string | null }[]>`
      SELECT trial_ends_at FROM tenants WHERE id = ${tenantId}
    `
    expect(stored[0]!.trial_ends_at).not.toBeNull()
    expect(
      Math.abs(new Date(stored[0]!.trial_ends_at as Date | string).getTime() - expected),
    ).toBeLessThan(60_000)
  })

  it('lanza TenantNotFoundError y no escribe audit para un tenant inexistente', async () => {
    const sql = getSql()
    const ghostTenant = '00000000-0000-0000-0000-0000000000aa'

    await expect(extendTrial(ghostTenant, 10, systemAdminId)).rejects.toBeInstanceOf(
      TenantNotFoundError,
    )

    expect(await fetchSupportAudits(sql, ghostTenant)).toHaveLength(0)
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

    await expect(forceTenantStatus(tenantId, 'suspended', systemAdminId)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    )

    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })

  it('respeta los gates temporales del FSM: past_due → suspended con dunning < 7d falla sin audit', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'past_due', 'predio', {
      dunningStartedAt: new Date(), // recién arrancó el dunning — gate de 7d no cumplido
    })

    await expect(forceTenantStatus(tenantId, 'suspended', systemAdminId)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    )

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

  it('past_due → suspended con dunning ≥ 7d SÍ pasa el gate y audita', async () => {
    // Contraparte del gate-fail: prueba que el gate es CONDICIONAL, no un
    // bloqueo absoluto. Si alguien convirtiera el gate en un hard-block, el
    // fail-test seguiría verde pero este caería.
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'past_due', 'predio', {
      dunningStartedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    })

    const result = await forceTenantStatus(tenantId, 'suspended', systemAdminId)
    expect(result).toEqual({ from: 'past_due', to: 'suspended' })

    expect(await fetchTenantStatus(sql, tenantId)).toBe('suspended')
    expect((await fetchSubRow(sql, tenantId)).status).toBe('suspended')

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.status_forced')
    expect(audits[0]!.metadata).toMatchObject({
      before: { status: 'past_due' },
      after: { status: 'suspended' },
    })
  })

  it('forzar → active sin subscription lanza SubscriptionNotFoundError sin tocar el tenant', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql) // trialing, sin tenant_subscriptions

    await expect(forceTenantStatus(tenantId, 'active', systemAdminId)).rejects.toBeInstanceOf(
      SubscriptionNotFoundError,
    )

    expect(await fetchTenantStatus(sql, tenantId)).toBe('trialing')
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })

  // 'deleted' YA NO es un destino forzable manualmente (ver comentario de
  // FORCEABLE_TRANSITIONS): forzarlo marcaba el status sin borrar filas hijas
  // ni cancelar el preapproval MP, y el sweep de retención excluye
  // status='deleted' de sus targets → tenant huérfano para siempre. El borrado
  // real es responsabilidad exclusiva del cron de retención.
  //
  // scheduled_deletion_at se fija en el PASADO para que el tenant sea, en
  // todo lo demás, elegible para el borrado real del cron de retención — así
  // el test confirma que aun siendo elegible, forzar 'deleted' a mano se
  // rechaza por el bloqueo de FORCEABLE_TRANSITIONS (única guarda tras quitar
  // el force-'deleted'; el estado terminal ya no tiene transición de FSM).
  it.each(['blocked', 'canceled', 'churned'] as const)(
    '%s → deleted ya NO es forzable: InvalidTransitionError sin audit ni cambio',
    async (fromStatus) => {
      const sql = getSql()
      const tenantId = await seedTenantWithStaff(sql)
      await seedSubscription(sql, tenantId, fromStatus, 'predio')
      await sql`
        UPDATE tenants SET scheduled_deletion_at = NOW() - INTERVAL '1 day' WHERE id = ${tenantId}
      `

      await expect(forceTenantStatus(tenantId, 'deleted', systemAdminId)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      )

      expect(await fetchTenantStatus(sql, tenantId)).toBe(fromStatus)
      expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
    },
  )
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
    expect(audits[0]!.metadata).toMatchObject({
      reason: 'reactivated_by_support',
      before: { status: 'canceled' },
      after: { status: 'active' },
    })
  })

  it('churned → active capturando el estado origen real en el audit', async () => {
    // El metadata.before.status debe reflejar el ORIGEN real, no un literal
    // hardcodeado. Una regresión que fijara before='canceled' pasaría el test
    // de arriba pero fallaría acá.
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'churned', 'predio')

    const result = await reactivateTenant(tenantId, systemAdminId)
    expect(result.from).toBe('churned')

    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.metadata).toMatchObject({ before: { status: 'churned' } })
  })

  it('reactivar sin subscription lanza SubscriptionNotFoundError', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql) // trialing, sin sub

    await expect(reactivateTenant(tenantId, systemAdminId)).rejects.toBeInstanceOf(
      SubscriptionNotFoundError,
    )

    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
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

    const result = await changePlanForSupport(tenantId, plans.complejo, systemAdminId, mockGateway)
    expect(result).toEqual({ fromPlanId: plans.predio, toPlanId: plans.complejo })

    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.complejo)

    // Sin cobro hoy: cero preferences de proración; solo update del monto recurrente.
    expect(mockGateway.saasUpgradePreferenceCalls).toHaveLength(0)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(1)
    expect(mockGateway.updatePreapprovalCalls[0]!.preapprovalId).toBe('mp-preapp-test-1')
    // El monto recurrente nuevo debe ser EXACTAMENTE el price_monthly del plan
    // destino (centavos). Sin este assert, mandar el precio del plan viejo o el
    // anual en vez del mensual pasaría inadvertido.
    const [{ price_monthly: complejoMonthly }] = await sql<{ price_monthly: number }[]>`
      SELECT price_monthly FROM plans WHERE id = ${plans.complejo}
    `
    expect(mockGateway.updatePreapprovalCalls[0]!.amount).toBe(complejoMonthly)

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

    // Plan predio: max_courts 2 → con 4 canchas online el downgrade se bloquea.
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

  it('cambia el plan sin preapproval MP: no llama al gateway y audita mpAmountUpdated=false', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio') // sin mpSubscriptionId

    const result = await changePlanForSupport(tenantId, plans.complejo, systemAdminId, mockGateway)
    expect(result).toEqual({ fromPlanId: plans.predio, toPlanId: plans.complejo })

    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.complejo)
    // Sin preapproval activo NO debe tocarse MP.
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.plan_changed')
    expect(audits[0]!.metadata).toMatchObject({ mpAmountUpdated: false })
  })

  it('si el update del preapproval MP falla, rollbackea el plan y NO deja audit', async () => {
    // Invariante de atomicidad declarado en support.service: el UPDATE de
    // plan_id corre ANTES de tocar MP, pero todo vive en la misma tx de
    // withTenantContext. Si MP tira, la tx rollbackea → plan_id intacto y sin
    // audit. Este test caería si alguien sacara el plan_id del withTenantContext
    // o swallowara el error del gateway.
    class FailingGateway extends MockGateway {
      override async updatePreapprovalAmount(): Promise<void> {
        throw new Error('MP 500 — preapproval update failed')
      }
    }
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio', {
      mpSubscriptionId: 'mp-preapp-rollback-1',
    })

    await expect(
      changePlanForSupport(tenantId, plans.complejo, systemAdminId, new FailingGateway()),
    ).rejects.toThrow('MP 500')

    // Rollback: el plan sigue siendo el original y no quedó audit huérfano.
    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.predio)
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })

  it('rechaza reasignar el mismo plan con PlanAlreadyAssignedError sin tocar MP ni audit', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio', {
      mpSubscriptionId: 'mp-preapp-same-1',
    })

    await expect(
      changePlanForSupport(tenantId, plans.predio, systemAdminId, mockGateway),
    ).rejects.toBeInstanceOf(PlanAlreadyAssignedError)

    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.predio)
    expect(mockGateway.updatePreapprovalCalls).toHaveLength(0)
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })

  it('rechaza un plan destino inexistente/inactivo con PlanNotFoundError', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio')
    const ghostPlan = '00000000-0000-0000-0000-0000000000bb'

    await expect(
      changePlanForSupport(tenantId, ghostPlan, systemAdminId, mockGateway),
    ).rejects.toBeInstanceOf(PlanNotFoundError)

    expect((await fetchSubRow(sql, tenantId)).plan_id).toBe(plans.predio)
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

  it('si la cancelación del preapproval MP falla, NO deja el tenant medio-cancelado', async () => {
    // billing.cancel cancela el preapproval ANTES de transicionar a canceled.
    // Si MP tira, la tx debe rollbackear entera: nada de tenant 'canceled' sin
    // haber cortado el cobro recurrente (cobraríamos a alguien ya dado de baja).
    class FailingCancelGateway extends MockGateway {
      override async cancelPreapproval(): Promise<void> {
        throw new Error('MP 500 — cancel preapproval failed')
      }
    }
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)
    await seedSubscription(sql, tenantId, 'active', 'predio', {
      mpSubscriptionId: 'mp-preapp-cancel-fail-1',
    })

    await expect(
      cancelSubscriptionForSupport(
        tenantId,
        'baja solicitada',
        systemAdminId,
        new FailingCancelGateway(),
      ),
    ).rejects.toThrow('MP 500')

    expect(await fetchTenantStatus(sql, tenantId)).toBe('active')
    expect((await fetchSubRow(sql, tenantId)).status).toBe('active')
    expect(await fetchSupportAudits(sql, tenantId)).toHaveLength(0)
  })
})

// ─── updateTenantSettingsForSupport ──────────────────────────────────────────
// GAP: el 6º servicio exportado no tenía NINGÚN test. Cubre el happy path
// (merge + audit con before/after reales) y el error de tenant inexistente.

describe('updateTenantSettingsForSupport', () => {
  it('aplica el patch whitelisteado y audita before/after con los valores reales', async () => {
    const sql = getSql()
    const tenantId = await seedTenantWithStaff(sql)

    const before = await sql<{ requires_deposit: boolean; booking_advance_days: number }[]>`
      SELECT (settings->>'requires_deposit')::boolean AS requires_deposit,
             (settings->>'booking_advance_days')::int AS booking_advance_days
      FROM tenants WHERE id = ${tenantId}
    `
    const prevRequiresDeposit = before[0]!.requires_deposit
    const prevAdvanceDays = before[0]!.booking_advance_days
    const nextRequiresDeposit = !prevRequiresDeposit
    const nextAdvanceDays = prevAdvanceDays + 3

    await updateTenantSettingsForSupport(
      tenantId,
      { requires_deposit: nextRequiresDeposit, booking_advance_days: nextAdvanceDays },
      systemAdminId,
    )

    // Efecto observable: el settings persistido refleja el patch; las claves NO
    // tocadas siguen presentes (merge, no overwrite).
    const after = await sql<
      { requires_deposit: boolean; booking_advance_days: number; accepts_cash: unknown }[]
    >`
      SELECT (settings->>'requires_deposit')::boolean AS requires_deposit,
             (settings->>'booking_advance_days')::int AS booking_advance_days,
             settings->'accepts_cash' AS accepts_cash
      FROM tenants WHERE id = ${tenantId}
    `
    expect(after[0]!.requires_deposit).toBe(nextRequiresDeposit)
    expect(after[0]!.booking_advance_days).toBe(nextAdvanceDays)
    expect(after[0]!.accepts_cash).not.toBeNull() // clave intacta tras el merge

    const audits = await fetchSupportAudits(sql, tenantId)
    expect(audits).toHaveLength(1)
    expect(audits[0]!.action).toBe('support.tenant.settings_updated')
    expect(audits[0]!.actor_type).toBe('system')
    expect(audits[0]!.actor_id).toBe(systemAdminId)
    expect(audits[0]!.metadata).toMatchObject({
      before: { requires_deposit: prevRequiresDeposit, booking_advance_days: prevAdvanceDays },
      after: { requires_deposit: nextRequiresDeposit, booking_advance_days: nextAdvanceDays },
    })
  })

  it('lanza TenantNotFoundError para un tenant inexistente', async () => {
    const ghostTenant = '00000000-0000-0000-0000-0000000000cc'

    await expect(
      updateTenantSettingsForSupport(ghostTenant, { requires_deposit: true }, systemAdminId),
    ).rejects.toBeInstanceOf(TenantNotFoundError)
  })
})
