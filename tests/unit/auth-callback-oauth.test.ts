import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  buildGoogleTermsCookie,
  GOOGLE_TERMS_COOKIE_NAME,
} from '@/shared/security/google-terms-cookie'

// Rama `code` (Google OAuth, jugador) reintroducida 2026-08-14 — mismo patrón
// de mocking que auth-callback-verify-errors.test.ts para la rama token_hash.
// El consentimiento viaja por una cookie firmada (no un query param — revisión
// adversarial 2026-08-14, ver google-terms-cookie.ts), así que estos tests
// simulan la cookie del request, no `?agreed=1`.

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

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/auth/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

/** Simula que startGoogleLoginFromReservar seteó la cookie (checkbox tildado). */
function withTermsCookie(termsVersion = 'v1'): void {
  mockCookieGet.mockReturnValue({ value: buildGoogleTermsCookie(termsVersion) })
}

const GOOGLE_USER = {
  id: 'auth-user-1',
  email: 'jugador@example.com',
  app_metadata: {},
  user_metadata: { full_name: 'Tomás Pérez' },
}

const mockSignOut = vi.fn().mockResolvedValue({})

function mockExchange(result: { data: { user: unknown } | null; error: unknown }) {
  mockCreateClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue(result),
      refreshSession: vi.fn().mockResolvedValue({}),
      signOut: mockSignOut,
    },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.IMPERSONATION_COOKIE_SECRET = 'test-secret-at-least-16-chars-long'
  mockCookieGet.mockReturnValue(undefined) // por default, sin cookie (/ingresar)
  mockCreateAdminClient.mockReturnValue({
    auth: { admin: { updateUserById: vi.fn().mockResolvedValue({}) } },
  } as never)
})

describe('GET /api/auth/callback — rama code (Google OAuth)', () => {
  it('código inválido/expirado -> /verify?error=exchange_failed', async () => {
    mockExchange({ data: { user: null }, error: { message: 'boom' } })

    const res = await GET(makeRequest({ code: 'bad-code', next: '/mis-reservas' }))

    const location = res.headers.get('location')
    expect(location).toContain('/verify')
    expect(new URL(location!).searchParams.get('error')).toBe('exchange_failed')
    expect(mockGetOrCreatePlayer).not.toHaveBeenCalled()
  })

  it('LoginGate (cookie de términos presente): alta nueva entra con consentimiento resuelto, va directo a next', async () => {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    withTermsCookie('v1')
    mockGetOrCreatePlayer.mockResolvedValue({
      id: 'player-1',
      wasCreated: true,
      hasAgreedTerms: true,
    })

    const res = await GET(makeRequest({ code: 'good-code', next: '/complejo-x/reservar' }))

    expect(mockGetOrCreatePlayer).toHaveBeenCalledWith(
      'jugador@example.com',
      expect.any(String),
      expect.any(String),
      { agreedToTerms: true, termsVersion: 'v1' },
    )
    // Single-use: se borra se haya podido usar o no.
    expect(mockCookieDelete).toHaveBeenCalledWith(GOOGLE_TERMS_COOKIE_NAME)
    const location = res.headers.get('location')
    expect(location).toContain('/verify')
    expect(location).not.toContain('/aceptar-terminos')
    expect(new URL(location!).searchParams.get('status')).toBe('success')
  })

  it('cookie de términos forjada (firma inválida) -> tratada como ausente, NO agreedTerms', async () => {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    mockCookieGet.mockReturnValue({ value: 'tampered.forged-signature' })
    mockGetOrCreatePlayer.mockResolvedValue({
      id: 'player-x',
      wasCreated: true,
      hasAgreedTerms: false,
    })

    await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(mockGetOrCreatePlayer).toHaveBeenCalledWith(
      'jugador@example.com',
      expect.any(String),
      expect.any(String),
      { agreedToTerms: false, termsVersion: 'v1' },
    )
  })

  it('/ingresar (sin cookie de términos): alta nueva sin consentimiento -> /aceptar-terminos', async () => {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    mockGetOrCreatePlayer.mockResolvedValue({
      id: 'player-2',
      wasCreated: true,
      hasAgreedTerms: false,
    })

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(mockGetOrCreatePlayer).toHaveBeenCalledWith(
      'jugador@example.com',
      expect.any(String),
      expect.any(String),
      { agreedToTerms: false, termsVersion: 'v1' },
    )
    const location = res.headers.get('location')
    expect(location).toContain('/aceptar-terminos')
    expect(new URL(location!).searchParams.get('next')).toBe('/mis-reservas')
  })

  it('cuenta YA es staff (tenant_id en app_metadata) -> rechaza, cierra sesión, NO mergea is_player', async () => {
    mockExchange({
      data: {
        user: { ...GOOGLE_USER, app_metadata: { tenant_id: 'tenant-1', staff_user_id: 'staff-1' } },
      },
      error: null,
    })

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(mockGetOrCreatePlayer).not.toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    const location = res.headers.get('location')
    expect(location).toContain('/verify')
    expect(new URL(location!).searchParams.get('error')).toBe('account_conflict')
  })

  it('cuenta YA es system_admin -> rechaza igual, NO mergea is_player', async () => {
    mockExchange({
      data: { user: { ...GOOGLE_USER, app_metadata: { is_system_admin: true } } },
      error: null,
    })

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(mockGetOrCreatePlayer).not.toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    const location = res.headers.get('location')
    expect(new URL(location!).searchParams.get('error')).toBe('account_conflict')
  })

  it('/ingresar, jugador YA existente y ya había aceptado -> directo a next, sin pantalla extra', async () => {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    mockGetOrCreatePlayer.mockResolvedValue({
      id: 'player-3',
      wasCreated: false,
      hasAgreedTerms: true,
    })

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    const location = res.headers.get('location')
    expect(location).not.toContain('/aceptar-terminos')
    expect(new URL(location!).searchParams.get('status')).toBe('success')
  })
})
