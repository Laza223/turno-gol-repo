import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  buildOwnerIntentCookie,
  OWNER_INTENT_COOKIE_NAME,
  OWNER_INTENT_COOKIE_TTL_MS,
} from '@/shared/security/owner-intent-cookie'

// Rama `code` con la cookie de intención "owner": la cuenta de Google se trata como staff.
// Mismo esquema de mocks que auth-callback-oauth.test.ts.

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({
  provisionAndRouteStaff: vi.fn(),
  syncStaffUserEmail: vi.fn(),
  OrphanedStaffSessionError: class OrphanedStaffSessionError extends Error {},
}))
vi.mock('@/modules/auth/email-verification.service', () => ({
  claimUnverifiedAccountWithGoogle: vi.fn(),
}))
vi.mock('@/modules/players/player.service', () => ({
  getOrCreatePlayer: vi.fn(),
  playerExistsByEmail: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/shared/observability', () => ({
  track: { auth: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => Promise<unknown>) => fn(),
}))

// Una cookie por nombre, como el navegador; `delete` la saca (un solo uso).
const jar = new Map<string, string>()
const mockCookieDelete = vi.fn((name: string) => void jar.delete(name))
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    delete: mockCookieDelete,
  }),
}))

import { createClient } from '@/lib/supabase/server'
import { claimUnverifiedAccountWithGoogle } from '@/modules/auth/email-verification.service'
import { provisionAndRouteStaff } from '@/modules/auth/auth.service'
import { getOrCreatePlayer, playerExistsByEmail } from '@/modules/players/player.service'
import { GET } from '@/app/api/auth/callback/route'

const mockSignOut = vi.fn().mockResolvedValue({})
const mockProvision = vi.mocked(provisionAndRouteStaff)
const mockPlayerExists = vi.mocked(playerExistsByEmail)
const mockGetOrCreatePlayer = vi.mocked(getOrCreatePlayer)

const GOOGLE_USER = {
  id: 'auth-user-1',
  email: 'dueno@gmail.com',
  app_metadata: {},
  user_metadata: { full_name: 'Marcelo Gómez' },
}

function mockExchange(user: unknown) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signOut: mockSignOut,
    },
  } as never)
}

function call() {
  const url = new URL('http://localhost/api/auth/callback')
  url.searchParams.set('code', 'good-code')
  url.searchParams.set('next', '/register/finalizar')
  return GET(new NextRequest(url))
}

const loc = (res: Response) => new URL(res.headers.get('location')!)

beforeEach(() => {
  vi.clearAllMocks()
  jar.clear()
  vi.stubEnv('IMPERSONATION_COOKIE_SECRET', 'test-secret-at-least-16-chars-long')
  mockPlayerExists.mockResolvedValue(false)
  mockProvision.mockResolvedValue({ path: '/onboarding' })
  mockGetOrCreatePlayer.mockResolvedValue({ id: 'p1', wasCreated: false, hasAgreedTerms: true })
})

describe('callback — Google con intención owner', () => {
  it('cuenta nueva: provisiona staff y va a /register/finalizar', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockExchange(GOOGLE_USER)

    const res = await call()

    expect(mockProvision).toHaveBeenCalledWith(GOOGLE_USER)
    expect(loc(res).pathname).toBe('/register/finalizar')
    expect(mockGetOrCreatePlayer).not.toHaveBeenCalled()
  })

  it('borra la cookie al usarla: el segundo intento (cookie reusada) cae al flujo de jugador', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockExchange(GOOGLE_USER)
    await call()
    expect(mockCookieDelete).toHaveBeenCalledWith(OWNER_INTENT_COOKIE_NAME)
    expect(jar.has(OWNER_INTENT_COOKIE_NAME)).toBe(false)

    mockProvision.mockClear()
    await call()
    expect(mockProvision).not.toHaveBeenCalled()
    expect(mockGetOrCreatePlayer).toHaveBeenCalledTimes(1)
  })

  it('el mail ya es de un jugador (fila en players): cierra sesión local y vuelve a /register', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockPlayerExists.mockResolvedValue(true)
    mockExchange(GOOGLE_USER)

    const res = await call()

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(loc(res).pathname).toBe('/register')
    expect(loc(res).searchParams.get('error')).toBe('player_account')
    expect(mockProvision).not.toHaveBeenCalled()
  })

  it('la cuenta de Auth ya tiene identidad de jugador: rechaza igual', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockExchange({ ...GOOGLE_USER, app_metadata: { is_player: true, player_id: 'p-1' } })

    const res = await call()

    expect(loc(res).searchParams.get('error')).toBe('player_account')
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mockProvision).not.toHaveBeenCalled()
  })

  it('cuenta que YA es staff con complejo: entra al panel, no al alta', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockProvision.mockResolvedValue({ path: '/dashboard' })
    mockExchange({ ...GOOGLE_USER, app_metadata: { staff_user_id: 's1', tenant_id: 't1' } })

    const res = await call()

    expect(loc(res).pathname).toBe('/dashboard')
    // Un staff existente no se trata como jugador aunque también tenga fila en players.
    expect(mockPlayerExists).not.toHaveBeenCalled()
  })

  it('la cookie no sirve fuera del viaje de alta (next distinto): sigue el flujo de jugador', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockExchange(GOOGLE_USER)
    const url = new URL('http://localhost/api/auth/callback')
    url.searchParams.set('code', 'good-code')
    url.searchParams.set('next', '/mis-reservas')

    await GET(new NextRequest(url))

    expect(mockProvision).not.toHaveBeenCalled()
    expect(mockGetOrCreatePlayer).toHaveBeenCalledTimes(1)
  })

  it('staff sin verificar que entra con Google verificado: invalida la contraseña y cierra las otras sesiones', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockProvision.mockResolvedValue({ path: '/dashboard' })
    vi.mocked(claimUnverifiedAccountWithGoogle).mockResolvedValue(true)
    mockExchange({
      ...GOOGLE_USER,
      app_metadata: { staff_user_id: 's1', tenant_id: 't1' },
      identities: [{ provider: 'google', identity_data: { email_verified: true } }],
    })

    await call()

    expect(claimUnverifiedAccountWithGoogle).toHaveBeenCalledWith('s1', 'auth-user-1')
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('sin identidad de Google verificada no reclama la cuenta', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockProvision.mockResolvedValue({ path: '/dashboard' })
    mockExchange({ ...GOOGLE_USER, app_metadata: { staff_user_id: 's1', tenant_id: 't1' } })

    await call()

    expect(claimUnverifiedAccountWithGoogle).not.toHaveBeenCalled()
  })

  it('falla la provisión: cierra sesión local y vuelve a /register con error', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockProvision.mockRejectedValue(new Error('db caída'))
    mockExchange(GOOGLE_USER)

    const res = await call()

    expect(loc(res).pathname).toBe('/register')
    expect(loc(res).searchParams.get('error')).toBe('provision_failed')
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('super admin con la cookie: no se salta su regla, sigue el camino de jugador (account_conflict)', async () => {
    jar.set(OWNER_INTENT_COOKIE_NAME, buildOwnerIntentCookie())
    mockExchange({ ...GOOGLE_USER, app_metadata: { is_system_admin: true } })

    const res = await call()

    expect(mockProvision).not.toHaveBeenCalled()
    expect(loc(res).searchParams.get('error')).toBe('account_conflict')
  })

  it.each([
    ['sin cookie', undefined],
    ['firma inválida', 'tampered.forged-signature'],
    ['vencida', 'EXPIRED'],
  ])('%s: todo sigue como hoy (jugador)', async (_n, value) => {
    if (value === 'EXPIRED') {
      jar.set(
        OWNER_INTENT_COOKIE_NAME,
        buildOwnerIntentCookie(Date.now() - OWNER_INTENT_COOKIE_TTL_MS - 1000),
      )
    } else if (value) jar.set(OWNER_INTENT_COOKIE_NAME, value)
    mockExchange({ ...GOOGLE_USER, email: 'jugador@example.com' })

    const res = await call()

    expect(mockProvision).not.toHaveBeenCalled()
    expect(mockGetOrCreatePlayer).toHaveBeenCalledTimes(1)
    expect(loc(res).pathname).not.toBe('/register/finalizar')
  })
})
