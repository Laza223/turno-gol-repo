import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import type { Sql } from 'postgres'

// Controla para qué tenantId(s) insertSystemAuditLog debe rechazar (caso de
// atomicidad/aislamiento: forzamos el fallo del audit de un tenant puntual
// para verificar que SU transacción per-tenant revierte sin afectar a otros).
let failAuditForTenantIds: Set<string> = new Set()

vi.mock('@/shared/db/audit', async () => {
  const actual = await vi.importActual<typeof import('@/shared/db/audit')>(
    '@/shared/db/audit',
  )
  return {
    ...actual,
    insertSystemAuditLog: async (
      ...args: Parameters<typeof actual.insertSystemAuditLog>
    ) => {
      const entry = args[1]
      if (failAuditForTenantIds.has(entry.tenantId)) {
        throw new Error('forced audit failure (atomicity test)')
      }
      return actual.insertSystemAuditLog(...args)
    },
  }
})

import { runExpireTrials } from '@/shared/jobs/workers/expire-trials.worker'

async function loadPredioPlanId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE slug = 'predio' LIMIT 1
  `
  return rows[0].id
}

async function seedTrialingTenant(
  sql: Sql,
  planId: string,
  trialEndsAt: Date,
): Promise<{ id: string }> {
  const tenant = await createTestTenant(sql)
  await sql`
    UPDATE tenants
    SET trial_ends_at = ${trialEndsAt.toISOString()}::timestamptz
    WHERE id = ${tenant.id}
  `
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end
    ) VALUES (
      ${tenant.id}, ${planId}, 'monthly'::billing_cycle, 'trialing'::subscription_status,
      NOW() - INTERVAL '14 days', ${trialEndsAt.toISOString()}::timestamptz
    )
  `
  return { id: tenant.id }
}

let planId: string

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  planId = await loadPredioPlanId(s)
}, 30_000)

afterEach(async () => {
  failAuditForTenantIds = new Set()
  await cleanupAll(getSql())
})

afterAll(async () => closeSql())

describe('runExpireTrials', () => {
  it('bloquea tenant + tenant_subscriptions + audit log en una sola transacción', async () => {
    const s = getSql()
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const tenant = await seedTrialingTenant(s, planId, past)

    await runExpireTrials()

    const tenantRows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenant.id}
    `
    expect(tenantRows[0].status).toBe('blocked')

    const subRows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(subRows[0].status).toBe('blocked')

    const auditRows = await s<{ action: string; resource_id: string }[]>`
      SELECT action, resource_id FROM audit_logs
      WHERE action = 'tenant.trial_expired' AND resource_id = ${tenant.id}
    `
    expect(auditRows).toHaveLength(1)
  })

  it('no-op: sin tenants vencidos no explota y no escribe audit', async () => {
    const s = getSql()

    await expect(runExpireTrials()).resolves.toBeUndefined()

    const auditRows = await s<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE action = 'tenant.trial_expired'
    `
    expect(auditRows).toHaveLength(0)
  })

  it('atomicidad per-tenant: si el audit falla, SU transacción revierte y el tenant NO queda blocked colgado (pero el worker no rechaza)', async () => {
    const s = getSql()
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const tenant = await seedTrialingTenant(s, planId, past)

    failAuditForTenantIds = new Set([tenant.id])
    await expect(runExpireTrials()).resolves.toBeUndefined()

    const tenantRows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenant.id}
    `
    expect(tenantRows[0].status).toBe('trialing')

    const subRows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(subRows[0].status).toBe('trialing')

    const auditRows = await s<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE resource_id = ${tenant.id}
    `
    expect(auditRows).toHaveLength(0)
  })

  it('aislamiento (blast-radius): un tenant con audit fallido no frena la expiración del resto', async () => {
    const s = getSql()
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const tenantA = await seedTrialingTenant(s, planId, past)
    const tenantB = await seedTrialingTenant(s, planId, past)

    failAuditForTenantIds = new Set([tenantA.id])
    await expect(runExpireTrials()).resolves.toBeUndefined()

    // A: su tx revirtió, sigue trialing y sin audit.
    const tenantARows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantA.id}
    `
    expect(tenantARows[0].status).toBe('trialing')

    const subARows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantA.id}
    `
    expect(subARows[0].status).toBe('trialing')

    const auditARows = await s<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE resource_id = ${tenantA.id}
    `
    expect(auditARows).toHaveLength(0)

    // B: no se vio afectado por el fallo de A, quedó bloqueado normalmente.
    const tenantBRows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantB.id}
    `
    expect(tenantBRows[0].status).toBe('blocked')

    const subBRows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantB.id}
    `
    expect(subBRows[0].status).toBe('blocked')

    const auditBRows = await s<{ action: string; resource_id: string }[]>`
      SELECT action, resource_id FROM audit_logs
      WHERE action = 'tenant.trial_expired' AND resource_id = ${tenantB.id}
    `
    expect(auditBRows).toHaveLength(1)
  })
})
