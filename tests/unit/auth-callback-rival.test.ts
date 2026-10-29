import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  buildGoogleTermsCookie,
  GOOGLE_TERMS_COOKIE_NAME,
} from '@/shared/security/google-terms-cookie'

// Vuelta del ingreso de RIVAL ("Voy"): mismo patrón de mocking que auth-callback-oauth.test.ts.
// Lo que se prueba: vuelve directo al partido y marca `signup_source` solo en el alta desde RIVAL.

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({
  provisionAndRouteStaff: vi.fn(),
  syncStaffUserEmail: vi.fn(),
}))
vi.mock('@/modules/players/player.service', () => ({ getOrCreatePlayer: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/shared/observability', () => ({
  track: { auth: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => Promise<unknown>) => fn(),
}))

const mockCookieGet = vi.fn()
const mockCookieDelete = vi.fn()
vi.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookieGet, delete: mockCookieDelete }),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { GET } from '@/app/api/auth/callback/route'

const mockCreateClient = vi.mocked(createClient)
const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockGetOrCreatePlayer = vi.mocked(getOrCreatePlayer)

const CODE = 'ABCDEFGH23'

const GOOGLE_USER = {
  id: 'auth-user-1',
  email: 'jugador@example.com',
  app_metadata: {},
  user_metadata: { full_name: 'Tomás Pérez' },
}

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/auth/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function mockExchange() {
  mockCreateClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi
        .fn()
        .mockResolvedValue({ data: { user: GOOGLE_USER }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({}),
      signOut: vi.fn().mockResolvedValue({}),
    },
  } as never)
}

function player(over: Partial<{ wasCreated: boolean; hasAgreedTerms: boolean }> = {}) {
  mockGetOrCreatePlayer.mockResolvedValue({
    id: 'player-1',
    wasCreated: true,
    hasAgreedTerms: true,
    ...over,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  mockCookieGet.mockImplementation((name: string) =>
    name === GOOGLE_TERMS_COOKIE_NAME ? { value: buildGoogleTermsCookie('v1') } : undefined,
  )
  mockCreateAdminClient.mockReturnValue({
    auth: { admin: { updateUserById: vi.fn().mockResolvedValue({}) } },
  } as never)
  mockExchange()
})

describe('GET /api/auth/callback — ingreso desde un partido de RIVAL', () => {
  it('vuelve DIRECTO al partido (sin /verify), conservando el vínculo del query', async () => {
    player()

    const res = await GET(
      makeRequest({ code: 'good-code', next: `/rival/p/${CODE}?rival_intent=a.b` }),
    )

    expect(res.headers.get('location')).toBe(`http://localhost/rival/p/${CODE}?rival_intent=a.b`)
  })

  it('alta que nace en RIVAL: pide marcar signup_source = rival', async () => {
    player()

    await GET(makeRequest({ code: 'good-code', next: `/rival/p/${CODE}` }))

    expect(mockGetOrCreatePlayer).toHaveBeenCalledWith(
      'jugador@example.com',
      expect.any(String),
      expect.any(String),
      { agreedToTerms: true, termsVersion: 'v1', signupSource: 'rival' },
    )
  })

  it('el tablón (/rival/partido/<id>) también marca signup_source = rival y vuelve DIRECTO (sin /verify)', async () => {
    player()
    const next = '/rival/partido/22222222-2222-4222-8222-222222222222'

    const res = await GET(makeRequest({ code: 'good-code', next }))

    expect(mockGetOrCreatePlayer.mock.calls[0]![3]).toMatchObject({ signupSource: 'rival' })
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe(next)
  })

  it('armar, la portada y Mis partidos también vuelven DIRECTO (sin /verify)', async () => {
    player()

    for (const next of ['/rival', '/rival/nuevo', '/rival/mis-partidos']) {
      const res = await GET(makeRequest({ code: 'good-code', next }))
      expect(new URL(res.headers.get('location')!).pathname).toBe(next)
    }
  })

  it('un next que NO empieza con /rival/ no marca nada', async () => {
    player()

    for (const next of ['/mis-reservas', '/club-x/reservar', `/x?a=/rival/p/${CODE}`]) {
      mockGetOrCreatePlayer.mockClear()
      await GET(makeRequest({ code: 'good-code', next }))
      expect(mockGetOrCreatePlayer.mock.calls[0]![3]).not.toHaveProperty('signupSource')
    }
  })

  it('sin consentimiento resuelto pasa por /aceptar-terminos con el partido de next', async () => {
    mockCookieGet.mockReturnValue(undefined)
    player({ hasAgreedTerms: false })

    const res = await GET(makeRequest({ code: 'good-code', next: `/rival/p/${CODE}` }))

    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/aceptar-terminos')
    expect(location.searchParams.get('next')).toBe(`/rival/p/${CODE}`)
  })
})
