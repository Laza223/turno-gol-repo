import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

// Mock tenant service calls to avoid DB hits — the test focuses on state guard.
vi.mock('@/modules/tenants/tenant.service', () => ({
  connectMercadoPago: vi.fn(async () => {}),
  completeOnboarding: vi.fn(async () => {}),
}))

// Mock encryption so we don't need ENCRYPTION_KEY env.
vi.mock('@/lib/crypto/encrypt', () => ({
  encrypt: (s: string) => `enc(${s})`,
}))

// Mock fetch to control MP token response.
const fetchMock = vi.fn(
  async () =>
    new Response(
      JSON.stringify({
        access_token: 'at',
        refresh_token: 'rt',
        user_id: 1,
        public_key: 'pk',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
)
global.fetch = fetchMock as unknown as typeof global.fetch

import { GET as mpCallback } from '@/app/api/mp/callback/route'

const SECRET = 'test-mp-client-secret-1234567890'
const TENANT = 'tenant-xyz-abc'

function makeState(tenantId: string, secret: string, ts?: number): string {
  const payload = Buffer.from(`${tenantId}:${ts ?? Date.now()}`, 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

beforeEach(() => {
  process.env.MP_CLIENT_SECRET = SECRET
  process.env.MP_CLIENT_ID = 'test-client-id'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test.local'
  fetchMock.mockClear()
})

describe('MP OAuth callback state CSRF (B6.6)', () => {
  it('valid state + code → exchanges token + redirects /dashboard', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `https://app.test.local/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('state signed with WRONG secret → redirect mp_invalid_state, no token fetch', async () => {
    const state = makeState(TENANT, 'attacker-secret')
    const req = new NextRequest(
      `https://app.test.local/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tampered payload (different tenantId) with original signature → reject', async () => {
    const state = makeState(TENANT, SECRET)
    const [, sig] = state.split('.')
    const forgedPayload = Buffer.from('other-tenant:0', 'utf8').toString('base64url')
    const tampered = `${forgedPayload}.${sig}`
    const req = new NextRequest(
      `https://app.test.local/api/mp/callback?code=authcode&state=${tampered}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state without dot separator → redirect mp_invalid_state', async () => {
    const req = new NextRequest(
      'https://app.test.local/api/mp/callback?code=authcode&state=noseparator',
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('missing code → mp_missing_params', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `https://app.test.local/api/mp/callback?state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_missing_params/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signature length mismatch → reject without timing leak', async () => {
    const payload = Buffer.from(`${TENANT}:0`, 'utf8').toString('base64url')
    const shortSig = 'aa' // intentionally far shorter than valid HMAC base64url
    const req = new NextRequest(
      `https://app.test.local/api/mp/callback?code=authcode&state=${payload}.${shortSig}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
