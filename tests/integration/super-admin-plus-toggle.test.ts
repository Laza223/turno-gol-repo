import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { clearFeatureFlagCache, isFeatureEnabled } from '@/shared/feature-flags'
import { disablePlus, enablePlus } from '@/modules/billing/plus.service'
import { SubscriptionNotFoundError } from '@/modules/billing/billing.errors'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { cleanupAll, createTestSystemAdmin, createTestTenant, ensureRoles } from '../helpers/tenant'
import type { Sql } from 'postgres'

/**
 * TurnoGol Plus desde el panel SuperAdmin. Antes `setTenantPlus` upserteaba el
 * override del flag a secas; ahora el interruptor pasa por `enablePlus` /
 * `disablePlus` (billing): el override lo escribe el servicio de Plus DESPUÉS de
 * cobrar, y la baja inmediata del super-admin lo apaga. Mismos cuatro
 * escenarios que cubría el test viejo (prender/apagar sobre la misma fila,
 * audit con actor system, aislamiento entre complejos, complejo inexistente).
 * La cobertura del cobro está en `billing-plus.test.ts`.
 */

const NOW = new Date('2027-03-10T12:00:00Z')

let systemAdminId: string
let gateway: MockGateway
let planId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM plans WHERE is_active = true ORDER BY sort_order LIMIT 1
  `
  planId = rows[0]!.id
}, 30_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

beforeEach(async () => {
  clearFeatureFlagCache()
  gateway = new MockGateway()
  systemAdminId = (await createTestSystemAdmin(getSql())).id
})

/** Complejo con suscripción `active` sin débito en MP: el cobro no es lo que se prueba acá. */
async function seedTenant(sql: Sql): Promise<string> {
  const tenant = await createTestTenant(sql)
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, billed_courts, status,
      current_period_start, current_period_end
    ) VALUES (
      ${tenant.id}, ${planId}, 'monthly', 2, 'active',
      '2027-03-01T00:00:00Z'::timestamptz, '2027-04-01T00:00:00Z'::timestamptz
    )
  `
  await sql`UPDATE tenants SET status = 'active' WHERE id = ${tenant.id}`
  return tenant.id
}

const actor = () => ({ type: 'system', id: systemAdminId }) as const

const turnOn = (tenantId: string) =>
  enablePlus(tenantId, { pricePerCourtCents: null }, actor(), gateway, NOW)
const turnOff = (tenantId: string) =>
  disablePlus(tenantId, { mode: 'immediate' }, actor(), gateway, NOW)

async function overrideRows(tenantId: string): Promise<boolean[]> {
  const rows = await getSql()<{ value: boolean }[]>`
    SELECT value FROM feature_flags WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id = ${tenantId}
  `
  return rows.map((r) => r.value)
}

describe('interruptor de Plus del super-admin', () => {
  it('prender crea el override en true y isFeatureEnabled lo ve; apagar lo deja en false (misma fila)', async () => {
    const tenantId = await seedTenant(getSql())

    await turnOn(tenantId)
    expect(await overrideRows(tenantId)).toEqual([true])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, tenantId)).toBe(true)

    await turnOff(tenantId)
    expect(await overrideRows(tenantId)).toEqual([false])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, tenantId)).toBe(false)
  })

  it('audita con actor system y el id del super-admin (alta y baja)', async () => {
    const sql = getSql()
    const tenantId = await seedTenant(sql)

    await turnOn(tenantId)
    await turnOff(tenantId)

    const rows = await sql<{ action: string; actor_type: string; actor_id: string }[]>`
      SELECT action, actor_type, actor_id FROM audit_logs
      WHERE tenant_id = ${tenantId} AND action IN ('plus.enabled', 'plus.turned_off')
      ORDER BY action
    `
    expect(rows.map((r) => r.action)).toEqual(['plus.enabled', 'plus.turned_off'])
    for (const row of rows) {
      expect(row.actor_type).toBe('system')
      expect(row.actor_id).toBe(systemAdminId)
    }
  })

  it('no afecta a otro complejo', async () => {
    const sql = getSql()
    const a = await seedTenant(sql)
    const b = await createTestTenant(sql)

    await turnOn(a)

    expect(await overrideRows(b.id)).toEqual([])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, b.id)).toBe(false)
  })

  it('complejo inexistente: SubscriptionNotFoundError y sin fila', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999'

    await expect(turnOn(ghost)).rejects.toBeInstanceOf(SubscriptionNotFoundError)
    await expect(turnOff(ghost)).rejects.toBeInstanceOf(SubscriptionNotFoundError)

    expect(await overrideRows(ghost)).toEqual([])
  })
})
