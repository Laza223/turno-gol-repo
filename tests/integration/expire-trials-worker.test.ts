import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import type { Sql } from 'postgres'

// Controla para qué tenantId(s) insertSystemAuditLog debe rechazar (caso de
// atomicidad/aislamiento: forzamos el fallo del audit de un tenant puntual
// para verificar que SU transacción per-tenant revierte sin afectar a otros).
let failAuditForTenantIds: Set<string> = new Set()

vi.mock('@/shared/db/audit', async () => {
  const actual = await vi.importActual<typeof import('@/shared/db/audit')>('@/shared/db/audit')
  return {
    ...actual,
    insertSystemAuditLog: async (...args: Parameters<typeof actual.insertSystemAuditLog>) => {
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
  mpSubscriptionId: string | null = null,
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
      current_period_start, current_period_end, mp_subscription_id
    ) VALUES (
      ${tenant.id}, ${planId}, 'monthly'::billing_cycle, 'trialing'::subscription_status,
      NOW() - INTERVAL '14 days', ${trialEndsAt.toISOString()}::timestamptz, ${mpSubscriptionId}
    )
  `
  return { id: tenant.id }
}

/**
 * Un complejo cuya prueba ya venció y está en solo lectura (`suspended`).
 * `dunningStartedAt` lo convierte en el `suspended` de la mora, que este
 * barrido no tiene que tocar.
 */
async function seedReadOnlyTenant(
  sql: Sql,
  planId: string,
  trialEndsAt: Date,
  opts: { mpSubscriptionId?: string | null; dunningStartedAt?: Date | null } = {},
): Promise<{ id: string }> {
  const tenant = await seedTrialingTenant(sql, planId, trialEndsAt, opts.mpSubscriptionId ?? null)
  await sql`UPDATE tenants SET status = 'suspended' WHERE id = ${tenant.id}`
  await sql`
    UPDATE tenant_subscriptions
    SET status = 'suspended'::subscription_status,
        dunning_started_at = ${opts.dunningStartedAt ? opts.dunningStartedAt.toISOString() : null}::timestamptz
    WHERE tenant_id = ${tenant.id}
  `
  return tenant
}

async function statusOf(sql: Sql, tenantId: string): Promise<{ tenant: string; sub: string }> {
  const rows = await sql<{ tenant: string; sub: string }[]>`
    SELECT t.status AS tenant, ts.status AS sub
    FROM tenants t JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
    WHERE t.id = ${tenantId}
  `
  return rows[0]
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Hash de 32 hex, el formato real de un preapproval de MercadoPago. */
const PREAPPROVAL_ID = '5c6294a93fe04f309344f654479e633b'

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

// Decisión 2026-10-22: al vencer la prueba el complejo pasa a solo lectura
// (`suspended`), no a `blocked`.
describe('runExpireTrials', () => {
  it('pasa a solo lectura tenant + tenant_subscriptions + audit log en una sola transacción', async () => {
    const s = getSql()
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const tenant = await seedTrialingTenant(s, planId, past)

    await runExpireTrials()

    const tenantRows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenant.id}
    `
    expect(tenantRows[0].status).toBe('suspended')

    const subRows = await s<{ status: string; dunning_started_at: Date | null }[]>`
      SELECT status, dunning_started_at FROM tenant_subscriptions WHERE tenant_id = ${tenant.id}
    `
    expect(subRows[0].status).toBe('suspended')
    // Sin esto el panel lo leería como mora y el barrido de bloqueo no lo vería.
    expect(subRows[0].dunning_started_at).toBeNull()

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

    // B: no se vio afectado por el fallo de A, quedó en solo lectura normalmente.
    const tenantBRows = await s<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantB.id}
    `
    expect(tenantBRows[0].status).toBe('suspended')

    const subBRows = await s<{ status: string }[]>`
      SELECT status FROM tenant_subscriptions WHERE tenant_id = ${tenantB.id}
    `
    expect(subBRows[0].status).toBe('suspended')

    const auditBRows = await s<{ action: string; resource_id: string }[]>`
      SELECT action, resource_id FROM audit_logs
      WHERE action = 'tenant.trial_expired' AND resource_id = ${tenantB.id}
    `
    expect(auditBRows).toHaveLength(1)
  })
})

// El primer cobro de un complejo que ya activó el plan sale el mismo día en que
// vence la prueba, a la hora que MP disponga. Sin margen, el barrido de las
// 08:00 lo apagaba antes de que el cobro llegara.
describe('runExpireTrials — margen para el que ya activó el plan', () => {
  it('con débito pedido y la prueba vencida hace 1 día: NO lo expira ni le avisa', async () => {
    const s = getSql()
    const tenant = await seedTrialingTenant(
      s,
      planId,
      new Date(Date.now() - DAY_MS),
      PREAPPROVAL_ID,
    )

    await runExpireTrials()

    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'trialing', sub: 'trialing' })
    const auditRows = await s<{ id: string }[]>`
      SELECT id FROM audit_logs
      WHERE action = 'tenant.trial_expired' AND resource_id = ${tenant.id}
    `
    expect(auditRows).toHaveLength(0)
  })

  it('con débito pedido y el margen de 3 días ya pasado: pasa a solo lectura igual', async () => {
    const s = getSql()
    const tenant = await seedTrialingTenant(
      s,
      planId,
      new Date(Date.now() - 3 * DAY_MS - 60 * 60 * 1000),
      PREAPPROVAL_ID,
    )

    await runExpireTrials()

    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'suspended', sub: 'suspended' })
  })

  it('en la misma corrida, el que nunca activó el plan pasa a solo lectura y el que sí espera', async () => {
    const s = getSql()
    const vencio = new Date(Date.now() - DAY_MS)
    const sinPlan = await seedTrialingTenant(s, planId, vencio)
    const conPlan = await seedTrialingTenant(s, planId, vencio, PREAPPROVAL_ID)

    await runExpireTrials()

    expect(await statusOf(s, sinPlan.id)).toEqual({ tenant: 'suspended', sub: 'suspended' })
    expect(await statusOf(s, conPlan.id)).toEqual({ tenant: 'trialing', sub: 'trialing' })
  })
})

// Fin del solo lectura: a los 14 días de vencida la prueba (17 si ya tocó
// "Activar"), `suspended` → `blocked`. Es la misma fecha que `trialReadOnlyEndsAt`
// le muestra al dueño en el aviso del panel.
describe('runExpireTrials — fin del solo lectura de la prueba', () => {
  it('a los 14 días de vencida la prueba: lo bloquea, con audit', async () => {
    const s = getSql()
    const tenant = await seedReadOnlyTenant(s, planId, new Date(Date.now() - 14 * DAY_MS - 60_000))

    await runExpireTrials()

    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'blocked', sub: 'blocked' })
    const auditRows = await s<{ metadata: { reason: string } }[]>`
      SELECT metadata FROM audit_logs
      WHERE action = 'tenant.blocked' AND resource_id = ${tenant.id}
    `
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0].metadata.reason).toBe('trial_read_only_ended')
  })

  it('a los 13 días: sigue en solo lectura', async () => {
    const s = getSql()
    const tenant = await seedReadOnlyTenant(s, planId, new Date(Date.now() - 13 * DAY_MS))

    await runExpireTrials()

    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'suspended', sub: 'suspended' })
  })

  it('con débito pedido: el margen de 3 días se suma al solo lectura (16 días: sigue, 17: se bloquea)', async () => {
    const s = getSql()
    const sigue = await seedReadOnlyTenant(s, planId, new Date(Date.now() - 16 * DAY_MS), {
      mpSubscriptionId: PREAPPROVAL_ID,
    })
    const corta = await seedReadOnlyTenant(s, planId, new Date(Date.now() - 17 * DAY_MS - 60_000), {
      mpSubscriptionId: '6d7395b04ff15f41a455f765580f744c',
    })

    await runExpireTrials()

    expect(await statusOf(s, sigue.id)).toEqual({ tenant: 'suspended', sub: 'suspended' })
    expect(await statusOf(s, corta.id)).toEqual({ tenant: 'blocked', sub: 'blocked' })
  })

  it('el suspended de la mora (con dunning_started_at) no lo toca: lo bloquea su propio barrido', async () => {
    const s = getSql()
    const tenant = await seedReadOnlyTenant(s, planId, new Date(Date.now() - 60 * DAY_MS), {
      dunningStartedAt: new Date(Date.now() - 5 * DAY_MS),
    })

    await runExpireTrials()

    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'suspended', sub: 'suspended' })
    const auditRows = await s<{ id: string }[]>`
      SELECT id FROM audit_logs WHERE resource_id = ${tenant.id}
    `
    expect(auditRows).toHaveLength(0)
  })

  it('el que llega tarde a la prueba vencida no salta a blocked en la misma corrida', async () => {
    // Cron caído más días que el solo lectura: el bloqueo corre ANTES de
    // expirar, así que este complejo tiene al menos un día para mirar.
    const s = getSql()
    const tenant = await seedTrialingTenant(s, planId, new Date(Date.now() - 20 * DAY_MS))

    await runExpireTrials()
    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'suspended', sub: 'suspended' })

    // La corrida siguiente sí lo bloquea.
    await runExpireTrials()
    expect(await statusOf(s, tenant.id)).toEqual({ tenant: 'blocked', sub: 'blocked' })
  })
})
