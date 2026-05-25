import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Test crypto key — must be set before any module imports encrypt().
process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.MP_CLIENT_ID = 'test-client'
process.env.MP_CLIENT_SECRET = 'test-secret'

import { closeSql, getSql } from '@/shared/db/client'
import { encrypt, decrypt } from '@/lib/crypto/encrypt'
import { refreshTenantMpToken } from '@/modules/payments/mp-oauth'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

let mpCallSeq = 0
const realFetch = global.fetch

function installFetchMock(): void {
  global.fetch = vi.fn(async (url: any) => {
    if (typeof url === 'string' && url.includes('mercadopago.com/oauth/token')) {
      mpCallSeq += 1
      const seq = mpCallSeq
      return new Response(
        JSON.stringify({
          access_token: `fresh-access-${seq}`,
          refresh_token: `fresh-refresh-${seq}`,
          user_id: 12345,
          public_key: 'PK',
          expires_in: 21600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return realFetch(url as any)
  }) as any
}

async function seedTenantWithMpTokens(): Promise<string> {
  const sql = getSql()
  const tenant = await createTestTenant(sql)
  await sql`
    UPDATE tenants
    SET mp_access_token = ${encrypt('initial-access')},
        mp_refresh_token = ${encrypt('initial-refresh')}
    WHERE id = ${tenant.id}
  `
  return tenant.id
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

beforeEach(() => {
  mpCallSeq = 0
  installFetchMock()
})

afterAll(async () => {
  global.fetch = realFetch
  await closeSql()
})

describe('refresh-mp-tokens concurrency', () => {
  it('N=5 concurrent refresh on same tenant → all succeed, final DB tokens are valid + decryptable', async () => {
    const tenantId = await seedTenantWithMpTokens()

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => refreshTenantMpToken(tenantId)),
    )

    const ok = results.filter((r) => r.status === 'fulfilled').length
    expect(ok).toBe(5)

    // Each refresh fetches MP once — last-writer-wins on the row.
    expect(mpCallSeq).toBe(5)

    const sql = getSql()
    const [row] = await sql<{ access: string; refresh: string }[]>`
      SELECT mp_access_token AS access, mp_refresh_token AS refresh
      FROM tenants WHERE id = ${tenantId}
    `
    const finalAccess = decrypt(row.access)
    const finalRefresh = decrypt(row.refresh)

    expect(finalAccess).toMatch(/^fresh-access-\d+$/)
    expect(finalRefresh).toMatch(/^fresh-refresh-\d+$/)

    const [meta] = await sql<{ ts: string | Date }[]>`
      SELECT mp_connected_at AS ts FROM tenants WHERE id = ${tenantId}
    `
    expect(new Date(meta.ts).getTime()).toBeGreaterThan(Date.now() - 60_000)
  }, 30_000)

  it('refresh fails for tenant without mp_refresh_token → throws + no DB write', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)

    await expect(refreshTenantMpToken(tenant.id)).rejects.toThrow(
      /no MercadoPago account connected|not connected/i,
    )

    const [row] = await sql<{ access: string | null }[]>`
      SELECT mp_access_token AS access FROM tenants WHERE id = ${tenant.id}
    `
    expect(row.access).toBeNull()
  }, 30_000)
})
