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
import { logger } from '@/shared/lib/logger'
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
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
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
    // Una reserva en curso vuelve DIRECTO a confirmar: ya tocó "Continuar", no hay /verify en el medio.
    expect(res.headers.get('location')).toBe('http://localhost/complejo-x/reservar')
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

    const res = await GET(
      makeRequest({ code: 'good-code', next: '/club-x/reservar?court=1', via: 'google' }),
    )

    expect(mockGetOrCreatePlayer).not.toHaveBeenCalled()
    // Local: el rechazo no puede cerrar el panel que esa cuenta tenga abierto en otro dispositivo.
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/verify')
    expect(location.searchParams.get('error')).toBe('account_conflict')
    // La vía y el destino viajan a /verify para ofrecer el reintento correcto.
    expect(location.searchParams.get('via')).toBe('google')
    expect(location.searchParams.get('next')).toBe('/club-x/reservar?court=1')
  })

  it('cuenta YA es system_admin -> rechaza igual, NO mergea is_player', async () => {
    mockExchange({
      data: { user: { ...GOOGLE_USER, app_metadata: { is_system_admin: true } } },
      error: null,
    })

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(mockGetOrCreatePlayer).not.toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
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

// La vuelta directa: una reserva en curso no pasa por /verify (otra pantalla y otro toque);
// cualquier otro destino sí, y los errores siguen yendo a /verify?error=.
describe('GET /api/auth/callback — la vuelta de una reserva en curso', () => {
  const BOOKING_NEXT =
    '/complejo-x/reservar?court=c1&date=2099-01-02&time=21:00&dur=60&booking_intent=tok.sig'

  function playerLoggedIn(over: { wasCreated: boolean; hasAgreedTerms: boolean }) {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    mockGetOrCreatePlayer.mockResolvedValue({ id: 'player-b', ...over })
  }

  it.each([
    ['alta nueva', { wasCreated: true, hasAgreedTerms: true }],
    ['jugador que ya existía', { wasCreated: false, hasAgreedTerms: true }],
  ])('%s: redirect directo al next, con su query (booking_intent incluido)', async (_n, over) => {
    playerLoggedIn(over)

    const res = await GET(makeRequest({ code: 'good-code', next: BOOKING_NEXT }))

    expect(res.headers.get('location')).toBe(`http://localhost${BOOKING_NEXT}`)
  })

  it('cualquier otro destino sigue por /verify con intent=login', async () => {
    playerLoggedIn({ wasCreated: true, hasAgreedTerms: true })

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(res.headers.get('location')).toBe(
      'http://localhost/verify?status=success&next=%2Fmis-reservas&intent=login',
    )
  })

  it('sin términos aceptados: primero /aceptar-terminos, con el next completo', async () => {
    playerLoggedIn({ wasCreated: true, hasAgreedTerms: false })

    const res = await GET(makeRequest({ code: 'good-code', next: BOOKING_NEXT }))

    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/aceptar-terminos')
    expect(location.searchParams.get('next')).toBe(BOOKING_NEXT)
  })

  it('un next hostil no saca al jugador del sitio: cae al default y pasa por /verify', async () => {
    playerLoggedIn({ wasCreated: true, hasAgreedTerms: true })

    const res = await GET(makeRequest({ code: 'good-code', next: '//evil.com/x/reservar' }))

    const location = new URL(res.headers.get('location')!)
    expect(location.origin).toBe('http://localhost')
    expect(location.pathname).toBe('/verify')
    expect(location.searchParams.get('next')).toBe('/mis-reservas')
  })

  it('los errores siguen por /verify?error=, también con una reserva en curso', async () => {
    mockExchange({ data: { user: null }, error: { message: 'boom' } })

    const res = await GET(makeRequest({ code: 'bad', next: BOOKING_NEXT, via: 'google' }))

    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/verify')
    expect(location.searchParams.get('error')).toBe('exchange_failed')
  })
})

// Antes: getOrCreatePlayer sin try/catch daba un 500 crudo, y un updateUserById
// fallido seguía de largo dejando la sesión SIN player_id (extractRealAuthUser cae
// al id de auth, que no es el de `players`: la sesión queda rota). Ahora todo
// termina en /verify con su código, el error en el log y la sesión de este
// intento cerrada (local).
describe('GET /api/auth/callback — robustez', () => {
  const updateFails = { auth: { admin: { updateUserById: vi.fn() } } }

  it('getOrCreatePlayer tira -> /verify?error=provision_failed, log y sesión local cerrada', async () => {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    mockGetOrCreatePlayer.mockRejectedValue(new Error('db caída'))

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas', via: 'google' }))

    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/verify')
    expect(location.searchParams.get('error')).toBe('provision_failed')
    expect(location.searchParams.get('via')).toBe('google')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('updateUserById devuelve error -> mismo corte: no se deja una sesión sin player_id', async () => {
    mockExchange({ data: { user: GOOGLE_USER }, error: null })
    mockGetOrCreatePlayer.mockResolvedValue({ id: 'p1', wasCreated: true, hasAgreedTerms: true })
    updateFails.auth.admin.updateUserById.mockResolvedValue({ error: { message: 'boom' } })
    mockCreateAdminClient.mockReturnValue(updateFails as never)

    const res = await GET(makeRequest({ code: 'good-code', next: '/mis-reservas' }))

    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('provision_failed')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it.each([
    ['el usuario canceló (access_denied sin error_code)', 'access_denied', '', 'oauth_cancelled'],
    // Un enlace de email vencido que pasó por GoTrue: no es una falla de Google.
    ['enlace de email vencido (error_code=otp_expired)', 'access_denied', 'otp_expired', 'expired'],
    [
      'rechazo de Supabase (access_denied con otro error_code)',
      'access_denied',
      'bad_oauth_callback',
      'oauth_failed',
    ],
    ['falla del proveedor (server_error)', 'server_error', 'unexpected_failure', 'oauth_failed'],
  ])('error devuelto al callback: %s', async (_name, error, errorCode, expected) => {
    const exchange = vi.fn()
    mockCreateClient.mockResolvedValue({ auth: { exchangeCodeForSession: exchange } } as never)

    const res = await GET(
      makeRequest({
        error,
        error_description: 'detalle del proveedor',
        next: '/mis-reservas',
        via: 'google',
        ...(errorCode ? { error_code: errorCode } : {}),
      }),
    )

    const location = new URL(res.headers.get('location')!)
    expect(location.searchParams.get('error')).toBe(expected)
    expect(location.searchParams.get('via')).toBe('google')
    expect(exchange).not.toHaveBeenCalled()
    // Cancelar o un enlace vencido no son fallas nuestras: avisan en warn y no van a Sentry.
    const [logged, notLogged] =
      expected === 'oauth_failed' ? [logger.error, logger.warn] : [logger.warn, logger.error]
    expect(logged).toHaveBeenCalledTimes(1)
    expect(notLogged).not.toHaveBeenCalled()
  })
})
