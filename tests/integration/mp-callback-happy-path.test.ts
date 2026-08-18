import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { AuthUser } from '@/modules/auth/types'

// El callback revalida admin autenticado del mismo tenant (route.ts:78-85). Se
// mockea la identidad; el `state` firmado + la persistencia en DB siguen reales.
// Mockear auth.middleware además evita el crash de React `cache()` en node.
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(),
  extractRealAuthUser: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/staff/staff.service')>()),
  getStaffRole: vi.fn(),
}))

// Env required by the callback route + real encryption. Set BEFORE importing the
// route module so module-eval and request-time reads both see them.
process.env.ENCRYPTION_KEY = 'b'.repeat(64)
process.env.MP_CLIENT_ID = 'client-int'
process.env.MP_CLIENT_SECRET = 'secret-int'
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test.local'

import { closeSql, getSql } from '@/shared/db/client'
import { decrypt } from '@/lib/crypto/encrypt'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffRole } from '@/modules/staff/staff.service'
import { GET as mpCallback } from '@/app/api/mp/callback/route'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

const SECRET = process.env.MP_CLIENT_SECRET!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!

function makeState(tenantId: string, ts: number = Date.now()): string {
  const payload = Buffer.from(`${tenantId}:${ts}`, 'utf8').toString('base64url')
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function stubMpToken(body: Record<string, unknown>, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )
}

// El callback exige admin autenticado del tenant embebido en el state (route.ts:78-85).
function mockAdminAuth(tenantId: string): void {
  const user: AuthUser = {
    type: 'staff',
    id: 'auth-hp',
    email: 'admin@test.local',
    staffUserId: 'staff-hp',
    tenantId,
    role: 'admin',
  }
  vi.mocked(extractAuthUser).mockResolvedValue(user)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
}

beforeAll(async () => {
  const sql = getSql()
  await ensureRoles(sql)
  await cleanupAll(sql)
}, 30_000)

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await closeSql()
})

describe('mp/callback happy path (DB real) — persistencia de OAuth de complejo', () => {
  it('persiste tokens MP cifrados, activa la seña, marca onboarding y redirige a /onboarding/listo', async () => {
    const sql = getSql()
    // Fresco, sin onboarding completado: el punto de este test es la
    // transición false→true que dispara el callback (F-004 hizo que el
    // default de createTestTenant() sea `true`, para las pruebas de
    // búsqueda/sitemap — acá se necesita lo contrario).
    const tenant = await createTestTenant(sql, { onboardingCompleted: false })
    mockAdminAuth(tenant.id)

    // Only the external MP token endpoint is mocked. Everything else (HMAC state
    // verify, encrypt-at-rest, DB write, onboarding flag) runs for real.
    stubMpToken({
      access_token: 'live-access',
      refresh_token: 'live-refresh',
      user_id: 777,
      public_key: 'live-pub',
    })

    const state = makeState(tenant.id)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=auth-code-xyz&state=${state}`)

    const res = await mpCallback(req)

    // Redirect al cierre peak-end del wizard (pages/onboarding.md §6.3).
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toMatch(/\/onboarding\/listo$/)

    // Tokens persisted ENCRYPTED — ciphertext on disk must not equal plaintext,
    // and must round-trip through decrypt to the values MP returned.
    const rows = await sql<
      {
        mp_access_token: string | null
        mp_refresh_token: string | null
        mp_user_id: string | null
        mp_public_key: string | null
        mp_connected_at: Date | null
        onboarding_completed: boolean | null
        requires_deposit: boolean | null
      }[]
    >`
      SELECT mp_access_token, mp_refresh_token, mp_user_id, mp_public_key, mp_connected_at,
             (settings->>'onboarding_completed')::boolean AS onboarding_completed,
             (settings->>'requires_deposit')::boolean AS requires_deposit
      FROM tenants WHERE id = ${tenant.id}
    `
    const row = rows[0]!
    expect(row.mp_access_token).not.toBeNull()
    expect(row.mp_access_token).not.toBe('live-access') // stored ciphertext, not plaintext
    expect(decrypt(row.mp_access_token!)).toBe('live-access')
    expect(decrypt(row.mp_refresh_token!)).toBe('live-refresh')
    expect(row.mp_user_id).toBe('777')
    expect(row.mp_public_key).toBe('live-pub')
    expect(row.mp_connected_at).not.toBeNull()
    expect(Date.now() - new Date(row.mp_connected_at!).getTime()).toBeLessThan(60_000)

    // Onboarding flipped to complete (the Aha-moment gate, doc10).
    expect(row.onboarding_completed).toBe(true)
    // Conectar MP desde el wizard = elección explícita "Sí, cobrar seña":
    // la seña queda activa (pages/onboarding.md §6.3).
    expect(row.requires_deposit).toBe(true)
  })

  it('si MP rechaza el token (400) no persiste credenciales y redirige a mp_token_failed', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql, { onboardingCompleted: false })
    mockAdminAuth(tenant.id)
    stubMpToken({ error: 'invalid_grant' }, 400)

    const state = makeState(tenant.id)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=bad-code&state=${state}`)

    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_token_failed/)

    const rows = await sql<
      { mp_access_token: string | null; onboarding_completed: boolean | null }[]
    >`
      SELECT mp_access_token, (settings->>'onboarding_completed')::boolean AS onboarding_completed
      FROM tenants WHERE id = ${tenant.id}
    `
    expect(rows[0]!.mp_access_token).toBeNull()
    // Not onboarded — failed connection must not flip the gate.
    expect(rows[0]!.onboarding_completed).not.toBe(true)
  })

  it('state expirado (>10min) no dispara intercambio ni escribe credenciales', async () => {
    const sql = getSql()
    const tenant = await createTestTenant(sql, { onboardingCompleted: false })
    mockAdminAuth(tenant.id)
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const state = makeState(tenant.id, Date.now() - (10 * 60 * 1000 + 1000))
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=auth-code&state=${state}`)

    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchSpy).not.toHaveBeenCalled()

    const rows = await sql<{ mp_access_token: string | null }[]>`
      SELECT mp_access_token FROM tenants WHERE id = ${tenant.id}
    `
    expect(rows[0]!.mp_access_token).toBeNull()
  })
})
