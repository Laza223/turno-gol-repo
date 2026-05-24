import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.ENCRYPTION_KEY = 'b'.repeat(64)
process.env.MP_CLIENT_ID = 'client-int'
process.env.MP_CLIENT_SECRET = 'secret-int'

import { closeSql, getSql } from '@/shared/db/client'
import { decrypt, encrypt } from '@/lib/crypto/encrypt'
import { refreshTenantMpToken } from '@/modules/payments/mp-oauth'
import { TenantMpNotConnectedError } from '@/modules/payments/payment.errors'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(() => {
  vi.restoreAllMocks()
})
afterAll(async () => {
  await closeSql()
})

describe('refreshTenantMpToken', () => {
  it('refreshes and persists new encrypted tokens', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await sql`
      UPDATE tenants
      SET mp_access_token = ${encrypt('old-access')},
          mp_refresh_token = ${encrypt('old-refresh')},
          mp_connected_at = NOW() - INTERVAL '10 hours'
      WHERE id = ${tenant.id}
    `

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
            user_id: 999,
            public_key: 'fresh-pub',
          }),
          { status: 200 },
        ),
      ),
    )

    const returnedEncrypted = await refreshTenantMpToken(tenant.id)
    expect(decrypt(returnedEncrypted)).toBe('fresh-access')

    const rows = await sql<
      { mp_access_token: string; mp_refresh_token: string; mp_user_id: string; mp_connected_at: Date }[]
    >`
      SELECT mp_access_token, mp_refresh_token, mp_user_id, mp_connected_at
      FROM tenants WHERE id = ${tenant.id}
    `
    expect(decrypt(rows[0]!.mp_access_token)).toBe('fresh-access')
    expect(decrypt(rows[0]!.mp_refresh_token)).toBe('fresh-refresh')
    expect(rows[0]!.mp_user_id).toBe('999')
    expect(Date.now() - new Date(rows[0]!.mp_connected_at).getTime()).toBeLessThan(60_000)
  })

  it('throws when the tenant has no refresh token', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql)
    await expect(refreshTenantMpToken(tenant.id)).rejects.toBeInstanceOf(
      TenantMpNotConnectedError,
    )
  })
})
