import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'
import { clearFeatureFlagCache, isFeatureEnabled } from '@/shared/feature-flags'
import { setTenantPlus, TenantNotFoundError } from '@/modules/super-admin/support.service'
import { BOT_FEATURE_FLAG } from '@/modules/whatsapp-bot/whatsapp-bot.connection'
import { cleanupAll, createTestSystemAdmin, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * TurnoGol Plus desde el panel SuperAdmin: `setTenantPlus` upsertea el override
 * por complejo de `whatsapp_bot`, audita `support.tenant.plus_toggled` y no toca
 * a otros complejos.
 */

let systemAdminId: string

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterAll(async () => {
  await cleanupAll(getSql())
  await closeSql()
})

beforeEach(async () => {
  clearFeatureFlagCache()
  systemAdminId = (await createTestSystemAdmin(getSql())).id
})

async function overrideRows(tenantId: string): Promise<boolean[]> {
  const rows = await getSql()<{ value: boolean }[]>`
    SELECT value FROM feature_flags WHERE key = ${BOT_FEATURE_FLAG} AND tenant_id = ${tenantId}
  `
  return rows.map((r) => r.value)
}

describe('setTenantPlus', () => {
  it('prender crea el override en true y isFeatureEnabled lo ve; apagar lo deja en false (misma fila)', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    await setTenantPlus(tenant.id, true, systemAdminId)
    expect(await overrideRows(tenant.id)).toEqual([true])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, tenant.id)).toBe(true)

    await setTenantPlus(tenant.id, false, systemAdminId)
    expect(await overrideRows(tenant.id)).toEqual([false])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, tenant.id)).toBe(false)
  })

  it('audita support.tenant.plus_toggled con actor system y {enabled}', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    await setTenantPlus(tenant.id, true, systemAdminId)

    const rows = await sql<{ actor_type: string; actor_id: string; metadata: unknown }[]>`
      SELECT actor_type, actor_id, metadata FROM audit_logs
      WHERE tenant_id = ${tenant.id} AND action = 'support.tenant.plus_toggled'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actor_type).toBe('system')
    expect(rows[0]!.actor_id).toBe(systemAdminId)
    const raw = rows[0]!.metadata
    const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { enabled: boolean }
    expect(meta.enabled).toBe(true)
  })

  it('no afecta a otro complejo', async () => {
    const sql = getSql()
    const a = await createTestTenant(sql)
    const b = await createTestTenant(sql)

    await setTenantPlus(a.id, true, systemAdminId)

    expect(await overrideRows(b.id)).toEqual([])
    expect(await isFeatureEnabled(BOT_FEATURE_FLAG, b.id)).toBe(false)
  })

  it('complejo inexistente: TenantNotFoundError y sin fila', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999'
    await expect(setTenantPlus(ghost, true, systemAdminId)).rejects.toBeInstanceOf(
      TenantNotFoundError,
    )
    expect(await overrideRows(ghost)).toEqual([])
  })
})
