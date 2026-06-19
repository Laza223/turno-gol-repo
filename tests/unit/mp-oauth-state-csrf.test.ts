import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

// Mock tenant service calls to avoid DB hits. We DO assert against these mocks:
// they are the observable side effect of a successful OAuth exchange (token
// persistence + onboarding completion).
vi.mock('@/modules/tenants/tenant.service', () => ({
  connectMercadoPago: vi.fn(async () => {}),
  completeOnboarding: vi.fn(async () => {}),
}))

// Mock encryption so we don't need ENCRYPTION_KEY env. The wrapper is
// identifiable (`enc(...)`) so tests can prove tokens are encrypted BEFORE they
// reach persistence — storing plaintext MP tokens is the regression we guard.
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
import { connectMercadoPago, completeOnboarding } from '@/modules/tenants/tenant.service'

const SECRET = 'test-mp-client-secret-1234567890'
const TENANT = 'tenant-xyz-abc'
const APP_URL = 'https://app.test.local'

function makeState(tenantId: string, secret: string, ts?: number): string {
  const payload = Buffer.from(`${tenantId}:${ts ?? Date.now()}`, 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// Read the body sent to MP's token endpoint (asserted in several tests).
function tokenRequestBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls[0]
  if (!call) throw new Error('fetch was not called')
  return JSON.parse(call[1]!.body as string)
}

beforeEach(() => {
  process.env.MP_CLIENT_SECRET = SECRET
  process.env.MP_CLIENT_ID = 'test-client-id'
  process.env.NEXT_PUBLIC_APP_URL = APP_URL
  fetchMock.mockClear()
  vi.mocked(connectMercadoPago).mockClear()
  vi.mocked(completeOnboarding).mockClear()
})

describe('MP OAuth callback — happy path side effects (B6.6)', () => {
  // Replaces the old "valid state + code → /dashboard" test AND the redundant
  // "state fresco dentro de la ventana" test. Both only asserted the redirect +
  // fetch count, so neither would catch: wrong tenantId extracted from payload,
  // tokens persisted in plaintext, user_id not stringified, or onboarding never
  // completed. We now assert the full observable side effect.
  it('persiste tokens ENCRIPTADOS para el tenant correcto, completa onboarding y redirige a /dashboard', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )

    const res = await mpCallback(req)

    // Redirect to dashboard.
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)

    // Tokens stored under the tenant decoded from the SIGNED payload, encrypted.
    expect(connectMercadoPago).toHaveBeenCalledTimes(1)
    expect(connectMercadoPago).toHaveBeenCalledWith(TENANT, {
      mpAccessToken: 'enc(at)',
      mpRefreshToken: 'enc(rt)',
      mpUserId: '1',
      mpPublicKey: 'pk',
    })
    // Onboarding flips to complete for that same tenant.
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
    expect(completeOnboarding).toHaveBeenCalledWith(TENANT)
  })

  it('intercambia el code en el endpoint de MP con grant_type y credenciales correctas', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )

    await mpCallback(req)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.mercadopago.com/oauth/token')
    expect(fetchMock.mock.calls[0]![1]!.method).toBe('POST')
    expect(tokenRequestBody()).toMatchObject({
      grant_type: 'authorization_code',
      code: 'authcode',
      client_id: 'test-client-id',
      client_secret: SECRET,
      redirect_uri: `${APP_URL}/api/mp/callback`,
    })
  })

  it('usa APP_URL como redirect_uri ignorando el Host del request (anti host-header injection)', async () => {
    // Valid (possibly replayed) state delivered to an attacker-controlled host.
    // The OAuth redirect_uri MUST stay pinned to APP_URL, otherwise an attacker
    // could redirect the code exchange and hijack the tenant's MP connection.
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `http://attacker.evil/api/mp/callback?code=authcode&state=${state}`,
    )

    await mpCallback(req)

    expect(tokenRequestBody().redirect_uri).toBe(`${APP_URL}/api/mp/callback`)
  })
})

describe('MP OAuth callback state CSRF (B6.6)', () => {
  it('state signed with WRONG secret → redirect mp_invalid_state, no token fetch', async () => {
    const state = makeState(TENANT, 'attacker-secret')
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('tampered payload (different tenantId) with original signature → reject', async () => {
    const state = makeState(TENANT, SECRET)
    const [, sig] = state.split('.')
    const forgedPayload = Buffer.from('other-tenant:0', 'utf8').toString('base64url')
    const tampered = `${forgedPayload}.${sig}`
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${tampered}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('state without dot separator → redirect mp_invalid_state', async () => {
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=noseparator`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('firma de largo distinto al HMAC → redirect 3xx mp_invalid_state (no 500 por timingSafeEqual)', async () => {
    // node:crypto timingSafeEqual THROWS RangeError on buffers of unequal
    // length. The route guards with an explicit length check first; without it
    // this request would 500. Assert we degrade to a clean redirect, not a crash.
    const payload = Buffer.from(`${TENANT}:0`, 'utf8').toString('base64url')
    const shortSig = 'aa' // intentionally far shorter than a valid HMAC base64url
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${payload}.${shortSig}`,
    )
    const res = await mpCallback(req)
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('missing code → mp_missing_params', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_missing_params/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('missing state → mp_missing_params', async () => {
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_missing_params/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('MP OAuth callback state expiry (replay protection, #10)', () => {
  it('state older than 10 min → reject, no token fetch', async () => {
    const state = makeState(TENANT, SECRET, Date.now() - (10 * 60 * 1000 + 1000))
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state recién dentro de la ventana (~9m59s) → intercambia token', async () => {
    // Boundary: just inside the 10-min TTL must still succeed. Guards against an
    // off-by-one that would reject legitimate, slow OAuth round-trips.
    const state = makeState(TENANT, SECRET, Date.now() - (10 * 60 * 1000 - 1000))
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('state with future timestamp (clock skew / forjado) → reject', async () => {
    const state = makeState(TENANT, SECRET, Date.now() + 60 * 60 * 1000)
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state firmado pero sin segmento de timestamp → reject', async () => {
    const payload = Buffer.from(TENANT, 'utf8').toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${payload}.${sig}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state con timestamp no numérico (firmado) → reject', async () => {
    // Number('abc') === NaN; the route rejects via !Number.isFinite. Without
    // that guard, NaN comparisons are all false and the state would pass.
    const payload = Buffer.from(`${TENANT}:abc`, 'utf8').toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${payload}.${sig}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })
})

describe('MP OAuth callback error paths', () => {
  it('NEXT_PUBLIC_APP_URL ausente → mp_config_missing, sin fetch ni persistencia', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL // restored by beforeEach
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_config_missing/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('MP devuelve token no-ok (400) → mp_token_failed, no persiste ni completa onboarding', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    )
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(
      `${APP_URL}/api/mp/callback?code=authcode&state=${state}`,
    )
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_token_failed/)
    expect(connectMercadoPago).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })
})
