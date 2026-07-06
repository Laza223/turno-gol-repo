import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { AuthUser } from '@/modules/auth/types'

// El callback revalida admin autenticado del mismo tenant (route.ts:78-85). Se
// mockea la identidad; el `state` firmado sigue siendo real. Mockear
// auth.middleware además evita el crash de React `cache()` al importar el route
// en el entorno node de vitest.
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(),
  extractRealAuthUser: vi.fn(),
}))
vi.mock('@/modules/staff/staff.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/staff/staff.service')>()),
  getStaffRole: vi.fn(),
}))

import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffRole } from '@/modules/staff/staff.service'
import { GET as mpCallback } from '@/app/api/mp/callback/route'

const env = process.env as Record<string, string | undefined>
const saved: Record<string, string | undefined> = {}

const SECRET = 'app-url-test-secret-1234567890'

// A fully valid, fresh, correctly-signed state. The route only reaches the
// APP_URL check AFTER passing HMAC verification + the replay window, so the
// state must be valid — otherwise the request bounces on mp_invalid_state and
// the APP_URL branch is never exercised (the original false-coverage bug).
function freshState(tenantId = 'tenant-appurl'): string {
  const payload = Buffer.from(`${tenantId}:${Date.now()}`, 'utf8').toString('base64url')
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

beforeEach(() => {
  saved.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL
  saved.NODE_ENV = env.NODE_ENV
  saved.MP_CLIENT_SECRET = env.MP_CLIENT_SECRET
  env.MP_CLIENT_SECRET = SECRET
  // Admin autenticado del tenant embebido en freshState() (default 'tenant-appurl').
  const user: AuthUser = {
    type: 'staff',
    id: 'auth-appurl',
    email: 'admin@test.local',
    staffUserId: 'staff-appurl',
    tenantId: 'tenant-appurl',
    role: 'admin',
  }
  vi.mocked(extractAuthUser).mockResolvedValue(user)
  vi.mocked(getStaffRole).mockResolvedValue('admin')
})
afterEach(() => {
  env.NEXT_PUBLIC_APP_URL = saved.NEXT_PUBLIC_APP_URL
  env.NODE_ENV = saved.NODE_ENV
  env.MP_CLIENT_SECRET = saved.MP_CLIENT_SECRET
  vi.unstubAllGlobals()
})

describe('mp/callback: APP_URL required to exchange the OAuth code', () => {
  it('con state válido pero APP_URL ausente → mp_config_missing, sin intercambio de token', async () => {
    env.NODE_ENV = 'production'
    delete env.NEXT_PUBLIC_APP_URL
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    // Host atacante en el request: aunque hubiese fallback al origin, debe
    // negarse — no debe derivar el redirect_uri del Host entrante.
    const req = new NextRequest(
      `http://attacker.example/api/mp/callback?code=authcode&state=${freshState()}`,
    )
    const res = await mpCallback(req)

    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    // Exact branch: NOT the alternation that previously let a bounce on
    // mp_invalid_state pass for the wrong reason.
    expect(res.headers.get('location')).toMatch(/mp_config_missing/)
    expect(res.headers.get('location')).not.toMatch(/mp_invalid_state/)
    // Never reached the token endpoint.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('control: con APP_URL presente el mismo state válido SÍ avanza al intercambio de token', async () => {
    // Proves the previous test fails on the APP_URL branch specifically, not on
    // state verification — same state, APP_URL set ⇒ reaches fetch.
    env.NEXT_PUBLIC_APP_URL = 'https://app.test.local'
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 400 })) // 400 → stop before DB writes
    vi.stubGlobal('fetch', fetchSpy)

    const req = new NextRequest(
      `https://app.test.local/api/mp/callback?code=authcode&state=${freshState()}`,
    )
    const res = await mpCallback(req)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(res.headers.get('location')).toMatch(/mp_token_failed/)
  })
})
