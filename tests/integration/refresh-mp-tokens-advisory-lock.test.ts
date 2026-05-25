import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Test crypto key — must be set before any module imports encrypt().
process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.MP_CLIENT_ID = 'test-client'
process.env.MP_CLIENT_SECRET = 'test-secret'

import { closeSql, getSql } from '@/shared/db/client'
import { encrypt, decrypt } from '@/lib/crypto/encrypt'
import { runRefreshMpTokens } from '@/shared/jobs/workers/refresh-mp-tokens.worker'
import {
  cleanupAll,
  createTestTenant,
  ensureRoles,
} from '../helpers/tenant'

let mpCallSeq = 0
let mpCallDelayMs = 0
const realFetch = global.fetch

function installFetchMock(): void {
  global.fetch = vi.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('mercadopago.com/oauth/token')) {
      mpCallSeq += 1
      const seq = mpCallSeq
      if (mpCallDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, mpCallDelayMs))
      }
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
    return realFetch(url as Parameters<typeof realFetch>[0])
  }) as typeof fetch
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

beforeEach(async () => {
  await cleanupAll(getSql())
  mpCallSeq = 0
  mpCallDelayMs = 0
  installFetchMock()
})

afterAll(async () => {
  global.fetch = realFetch
  await closeSql()
})

describe('refresh-mp-tokens advisory lock', () => {
  it('N=5 concurrent runRefreshMpTokens on same tenant → exactly 1 MP fetch, 4 skipped_locked', async () => {
    const tenantId = await seedTenantWithMpTokens()

    // Hold the MP fetch long enough for the other 4 workers to race the lock
    // attempt before the lock-holder commits. Without this delay, the 5 calls
    // are likely to serialize fast enough that all observe `locked=true`.
    mpCallDelayMs = 200

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => runRefreshMpTokens()),
    )

    // All worker invocations succeed (failures are logged + swallowed per row).
    for (const r of results) {
      expect(r.status).toBe('fulfilled')
    }

    // Only the lock-holder hits MP. The other 4 see `locked=false` and skip.
    expect(mpCallSeq).toBe(1)

    const sql = getSql()
    const [row] = await sql<{ access: string; refresh: string }[]>`
      SELECT mp_access_token AS access, mp_refresh_token AS refresh
      FROM tenants WHERE id = ${tenantId}
    `
    expect(decrypt(row.access)).toBe('fresh-access-1')
    expect(decrypt(row.refresh)).toBe('fresh-refresh-1')
  }, 30_000)

  it('lock auto-releases after tx commit: second pass refreshes normally', async () => {
    const tenantId = await seedTenantWithMpTokens()

    await runRefreshMpTokens()
    expect(mpCallSeq).toBe(1)

    // Run again immediately; the prior tx (and its advisory lock) already
    // committed, so this pass acquires the lock and refreshes again.
    await runRefreshMpTokens()
    expect(mpCallSeq).toBe(2)

    const sql = getSql()
    const [row] = await sql<{ access: string }[]>`
      SELECT mp_access_token AS access FROM tenants WHERE id = ${tenantId}
    `
    expect(decrypt(row.access)).toBe('fresh-access-2')
  }, 30_000)

  it('tenant with mp_refresh_token IS NULL is filtered out of the sweep', async () => {
    const sql = getSql()
    // Tenant without MP tokens — not in the SELECT.
    await createTestTenant(sql)

    await runRefreshMpTokens()
    expect(mpCallSeq).toBe(0)
  }, 30_000)

  it('multiple tenants refresh independently in one pass (lock is per-tenant)', async () => {
    const tenantA = await seedTenantWithMpTokens()
    const tenantB = await seedTenantWithMpTokens()

    await runRefreshMpTokens()
    expect(mpCallSeq).toBe(2)

    const sql = getSql()
    const rows = await sql<{ id: string; access: string }[]>`
      SELECT id, mp_access_token AS access
      FROM tenants WHERE id IN (${tenantA}, ${tenantB})
      ORDER BY id
    `
    for (const r of rows) {
      expect(decrypt(r.access)).toMatch(/^fresh-access-\d+$/)
    }
  }, 30_000)
})
