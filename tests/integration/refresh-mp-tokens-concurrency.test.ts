import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Test crypto key — must be set before any module imports encrypt().
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.MP_CLIENT_ID = 'test-client'
process.env.MP_CLIENT_SECRET = 'test-secret'

import { closeSql, getSql } from '@/shared/db/client'
import { encrypt, decrypt } from '@/lib/crypto/encrypt'
import { refreshTenantMpToken } from '@/modules/payments/mp-oauth'
import { runRefreshMpTokens } from '@/shared/jobs/workers/refresh-mp-tokens.worker'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

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
          // Distinto por llamada: el worker reescribe mp_user_id con lo que
          // devuelve MP, y una cuenta de MercadoPago cobra para UN solo
          // complejo (uq_tenants_mp_user_id, migr. 069). Con un valor fijo, el
          // segundo complejo choca con el primero y se queda sin refrescar.
          user_id: 12345 + seq,
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

describe('refresh-mp-tokens concurrency', () => {
  it('N=5 concurrent runRefreshMpTokens on same tenant → single-winner (1 MP fetch, 4 skipped)', async () => {
    // Scheduled-worker path: pg_try_advisory_xact_lock(hashtext('mp_refresh:'||id))
    // serializes refreshes per tenant. Only one worker per pass calls MP; the
    // others see `locked=false` and skip. Tokens on the DB row are exactly the
    // pair returned by the single MP call (not last-writer-wins).
    const tenantId = await seedTenantWithMpTokens()
    mpCallDelayMs = 200

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => runRefreshMpTokens()))

    const ok = results.filter((r) => r.status === 'fulfilled').length
    expect(ok).toBe(5)

    // Advisory lock guarantees a single MP fetch per pass, per tenant.
    expect(mpCallSeq).toBe(1)

    const sql = getSql()
    const [row] = await sql<{ access: string; refresh: string }[]>`
      SELECT mp_access_token AS access, mp_refresh_token AS refresh
      FROM tenants WHERE id = ${tenantId}
    `
    expect(decrypt(row.access)).toBe('fresh-access-1')
    expect(decrypt(row.refresh)).toBe('fresh-refresh-1')

    const [meta] = await sql<{ ts: string | Date }[]>`
      SELECT mp_connected_at AS ts FROM tenants WHERE id = ${tenantId}
    `
    expect(new Date(meta.ts).getTime()).toBeGreaterThan(Date.now() - 60_000)
  }, 30_000)

  it('refreshTenantMpToken concurrente: gana uno solo y el perdedor NO pisa la fila', async () => {
    // El camino per-request (`resolveTenantGateway` → onUnauthorized), que corre
    // DENTRO del webhook de pagos. Se asumía "una sola request en vuelo", pero
    // dos 401 simultáneos disparan dos refrescos con el MISMO refresh token: MP
    // rota y mata el viejo, los dos escribían, y el último en llegar dejaba
    // persistido un par que MP ya había invalidado. Resultado: el complejo
    // quedaba desconectado en silencio, sin poder cobrar señas.
    //
    // El compare-and-set del UPDATE (WHERE mp_refresh_token = el que usé) hace
    // que el segundo no pise nada y falle explícito.
    const tenantId = await seedTenantWithMpTokens()
    mpCallDelayMs = 150

    const results = await Promise.allSettled([
      refreshTenantMpToken(tenantId),
      refreshTenantMpToken(tenantId),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const sql = getSql()
    const [row] = await sql<{ access: string; refresh: string }[]>`
      SELECT mp_access_token AS access, mp_refresh_token AS refresh
      FROM tenants WHERE id = ${tenantId}
    `
    // La fila quedó con un PAR COHERENTE: el access y el refresh de la misma
    // llamada a MP, no uno de cada una.
    const accessSeq = decrypt(row.access).replace('fresh-access-', '')
    const refreshSeq = decrypt(row.refresh).replace('fresh-refresh-', '')
    expect(accessSeq).toBe(refreshSeq)
  }, 30_000)

  it('refreshTenantMpToken (per-request path) still throws when no refresh token', async () => {
    // Este es el camino del retry por 401 de `resolveTenantGateway`.
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
