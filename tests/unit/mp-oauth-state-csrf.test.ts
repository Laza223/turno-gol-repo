import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

// Mock tenant service calls to avoid DB hits. We DO assert against these mocks:
// they are the observable side effect of a successful OAuth exchange (token
// persistence + onboarding completion).
vi.mock('@/modules/tenants/tenant.service', () => ({
  connectMercadoPago: vi.fn(async () => {}),
  completeOnboarding: vi.fn(async () => {}),
  // Default: tenant en pleno wizard (onboarding incompleto) → el callback activa
  // la seña y cierra en /onboarding/listo. El caso "reconexión" lo overridea.
  getTenantById: vi.fn(async () => ({ id: 'tenant-xyz-abc', settings: {} })),
  updateTenantSettings: vi.fn(async () => {}),
  // Una cuenta de MP cobra para un solo complejo (migr. 069). Default: libre.
  findTenantUsingMpAccount: vi.fn(async () => null),
}))

// El callback ahora revalida sesión + rol (audit_report.md 3-15): sin esto
// extractAuthUser tocaría Supabase real. Default: admin autenticado del mismo
// tenant que el state — los tests de CSRF/expiry reactivan la sesión ANTES de
// llegar a los checks que ya existían, así que este mock no cambia lo que esos
// tests verifican.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))

// Mock encryption so we don't need ENCRYPTION_KEY env. The wrapper is
// identifiable (`enc(...)`) so tests can prove tokens are encrypted BEFORE they
// reach persistence — storing plaintext MP tokens is the regression we guard.
vi.mock('@/lib/crypto/encrypt', () => ({
  encrypt: (s: string) => `enc(${s})`,
}))

// Mock fetch to control MP token response. Typed to fetch's signature so the
// recorded `mock.calls` tuples carry the (input, init) args the route passes —
// otherwise vitest infers a zero-arg call shape and `call[0]`/`call[1]` fail typecheck.
// Vitest 3 unificó los genéricos de vi.fn: antes eran <TArgs, TReturn>, ahora es
// un único <T extends Procedure> con la firma completa de la función.
const fetchMock = vi.fn<typeof fetch>(
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
import {
  connectMercadoPago,
  completeOnboarding,
  findTenantUsingMpAccount,
  getTenantById,
  updateTenantSettings,
} from '@/modules/tenants/tenant.service'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffRole } from '@/modules/staff/staff.service'

const SECRET = 'test-mp-client-secret-1234567890'
const TENANT = 'tenant-xyz-abc'
const APP_URL = 'https://app.test.local'
const ADMIN_USER = {
  type: 'staff' as const,
  id: 'u1',
  email: 'admin@test.local',
  staffUserId: 'staff-1',
  tenantId: TENANT,
  role: 'admin' as const,
}

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
  vi.mocked(updateTenantSettings).mockClear()
  vi.mocked(getTenantById)
    .mockReset()
    .mockResolvedValue({ id: TENANT, settings: {} } as never)
  vi.mocked(extractAuthUser)
    .mockReset()
    .mockResolvedValue(ADMIN_USER as never)
  vi.mocked(getStaffRole).mockReset().mockResolvedValue('admin')
})

describe('MP OAuth callback — happy path side effects (B6.6)', () => {
  // Replaces the old "valid state + code → /dashboard" test AND the redundant
  // "state fresco dentro de la ventana" test. Both only asserted the redirect +
  // fetch count, so neither would catch: wrong tenantId extracted from payload,
  // tokens persisted in plaintext, user_id not stringified, or onboarding never
  // completed. We now assert the full observable side effect.
  it('persiste tokens ENCRIPTADOS, activa la seña, completa onboarding y redirige a /onboarding/listo', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)

    const res = await mpCallback(req)

    // Redirect al cierre peak-end del wizard (pages/onboarding.md §6.3).
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toMatch(/\/onboarding\/listo$/)

    // Tokens stored under the tenant decoded from the SIGNED payload, encrypted.
    expect(connectMercadoPago).toHaveBeenCalledTimes(1)
    expect(connectMercadoPago).toHaveBeenCalledWith(TENANT, {
      mpAccessToken: 'enc(at)',
      mpRefreshToken: 'enc(rt)',
      mpUserId: '1',
      mpPublicKey: 'pk',
      // El mock de fetch devuelve el mismo payload para /users/me, que no trae
      // `nickname`: se guarda null y la conexión NO se pierde por eso.
      mpNickname: null,
    })
    // Conectar desde el wizard = elección "Sí, cobrar seña" → seña activa.
    expect(updateTenantSettings).toHaveBeenCalledWith(TENANT, { requires_deposit: true })
    // Onboarding flips to complete for that same tenant.
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
    expect(completeOnboarding).toHaveBeenCalledWith(TENANT)
  })

  it('reconexión (onboarding ya completo): NO toca la seña y redirige a facturación', async () => {
    vi.mocked(getTenantById).mockResolvedValue({
      id: TENANT,
      settings: { onboarding_completed: true },
    } as never)
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)

    const res = await mpCallback(req)

    expect(res.headers.get('location')).toMatch(/\/settings\/facturacion$/)
    expect(connectMercadoPago).toHaveBeenCalledTimes(1)
    // Respeta la config del admin: reconectar MP no re-activa la seña.
    expect(updateTenantSettings).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('intercambia el code en el endpoint de MP con grant_type y credenciales correctas', async () => {
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)

    await mpCallback(req)

    // Dos llamadas a MP: el intercambio del code y, después, /users/me para el
    // apodo de la cuenta. Lo que se fija acá es que la PRIMERA sea el token —
    // el orden importa, porque el apodo se pide con el access_token recién
    // obtenido.
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.mercadopago.com/oauth/token')
    expect(fetchMock.mock.calls[0]![1]!.method).toBe('POST')
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.mercadopago.com/users/me')
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
    const req = new NextRequest(`http://attacker.evil/api/mp/callback?code=authcode&state=${state}`)

    await mpCallback(req)

    expect(tokenRequestBody().redirect_uri).toBe(`${APP_URL}/api/mp/callback`)
  })
})

describe('MP OAuth callback state CSRF (B6.6)', () => {
  it('state signed with WRONG secret → redirect mp_invalid_state, no token fetch', async () => {
    const state = makeState(TENANT, 'attacker-secret')
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
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
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${tampered}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('state without dot separator → redirect mp_invalid_state', async () => {
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=noseparator`)
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
    const req = new NextRequest(`${APP_URL}/api/mp/callback?state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_missing_params/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('missing state → mp_missing_params', async () => {
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_missing_params/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('MP OAuth callback state expiry (replay protection, #10)', () => {
  it('state older than 10 min → reject, no token fetch', async () => {
    const state = makeState(TENANT, SECRET, Date.now() - (10 * 60 * 1000 + 1000))
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state recién dentro de la ventana (~9m59s) → intercambia token', async () => {
    // Boundary: just inside the 10-min TTL must still succeed. Guards against an
    // off-by-one that would reject legitimate, slow OAuth round-trips.
    const state = makeState(TENANT, SECRET, Date.now() - (10 * 60 * 1000 - 1000))
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/\/onboarding\/listo$/)
    // Dos: el intercambio del code y /users/me para el apodo de la cuenta.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('state with future timestamp (clock skew / forjado) → reject', async () => {
    const state = makeState(TENANT, SECRET, Date.now() + 60 * 60 * 1000)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state firmado pero sin segmento de timestamp → reject', async () => {
    const payload = Buffer.from(TENANT, 'utf8').toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${payload}.${sig}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('state con timestamp no numérico (firmado) → reject', async () => {
    // Number('abc') === NaN; the route rejects via !Number.isFinite. Without
    // that guard, NaN comparisons are all false and the state would pass.
    const payload = Buffer.from(`${TENANT}:abc`, 'utf8').toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${payload}.${sig}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_invalid_state/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })
})

describe('MP OAuth callback — sesión/rol revalidados (audit_report.md 3-15)', () => {
  it('sin sesión de staff → redirect a /login, sin exchange ni persistencia', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue(null)
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/\/login$/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('staff autenticado de OTRO tenant (state ajeno) → redirect a /login, no conecta el MP de ese tenant', async () => {
    vi.mocked(extractAuthUser).mockResolvedValue({
      ...ADMIN_USER,
      tenantId: 'otro-tenant',
    } as never)
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/\/login$/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('manager (Encargado) del tenant correcto → redirect mp_forbidden, no conecta MP', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_forbidden/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('membresía inactiva (rol null) → redirect mp_forbidden, no conecta MP', async () => {
    vi.mocked(getStaffRole).mockResolvedValue(null)
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_forbidden/)
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })
})

describe('MP OAuth callback error paths', () => {
  it('NEXT_PUBLIC_APP_URL ausente → mp_config_missing, sin fetch ni persistencia', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL // restored by beforeEach
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_config_missing/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(connectMercadoPago).not.toHaveBeenCalled()
  })

  it('MP_CLIENT_SECRET ausente → falla CERRADO (mp_config_missing), nunca verifica el state con clave vacía (hallazgo #5)', async () => {
    // Antes del fix: `process.env.MP_CLIENT_SECRET ?? ''` deja `secret = ''`
    // cuando falta la variable. Un state firmado con esa MISMA clave vacía
    // (que cualquiera puede reproducir — es un valor público, no un secreto)
    // pasaba `timingSafeEqual` igual y el flujo seguía andando: la protección
    // anti-CSRF se apaga en silencio en vez de romper el arranque.
    delete process.env.MP_CLIENT_SECRET
    const state = makeState(TENANT, '') // clave vacía: lo que cualquiera puede forjar
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
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
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)
    const res = await mpCallback(req)
    expect(res.headers.get('location')).toMatch(/mp_token_failed/)
    expect(connectMercadoPago).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })
})

// Una cuenta de MercadoPago cobra para UN solo complejo (migr. 069). Reproducido
// en producción el 2026-07-31: dos cuentas de TurnoGol distintas conectaron la
// misma cuenta de MP. No falló ninguna autorización — MP guarda el
// consentimiento por (usuario, aplicación), así que la segunda vez conecta sin
// preguntar nada.
describe('MP OAuth callback — una cuenta de MP por complejo', () => {
  it('cuenta ya usada por otro complejo → rechaza SIN pisar la conexión', async () => {
    ;(findTenantUsingMpAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'otro-tenant',
      name: 'Complejo Vecino',
    })
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)

    const res = await mpCallback(req)
    const location = res.headers.get('location') ?? ''

    expect(location).toMatch(/mp_already_connected/)
    // El nombre viaja para que el mensaje diga con QUÉ complejo choca.
    expect(decodeURIComponent(location)).toContain('Complejo Vecino')
    // Lo que más importa: no se guardó nada. El complejo que ya cobraba con esa
    // cuenta conserva su conexión intacta.
    expect(connectMercadoPago).not.toHaveBeenCalled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('cuenta libre → conecta y guarda el apodo de la cuenta', async () => {
    // El apodo existe para poder ver CUÁL cuenta quedó: antes solo había un
    // booleano y conectar la cuenta personal era invisible.
    const state = makeState(TENANT, SECRET)
    const req = new NextRequest(`${APP_URL}/api/mp/callback?code=authcode&state=${state}`)

    await mpCallback(req)

    expect(connectMercadoPago).toHaveBeenCalledTimes(1)
    const [, data] = (connectMercadoPago as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { mpUserId: string; mpNickname: string | null },
    ]
    expect(data.mpUserId).toBeTruthy()
    expect(data).toHaveProperty('mpNickname')
  })
})
