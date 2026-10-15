import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Rama token_hash: `user_metadata.is_player` (options.data del magic link) es lo
// que permite provisionar a un jugador nuevo antes de que exista
// app_metadata.is_player. Pero lo edita el propio usuario, así que con claims de
// staff ya grabados no reclasifica: una invitación aceptada por alguien que
// alguna vez empezó un alta de jugador sin confirmarla terminaba en
// account_conflict, afuera del panel. Mismo mocking que
// auth-callback-email-change.test.ts.

const { OrphanedStaffSessionError } = vi.hoisted(() => ({
  OrphanedStaffSessionError: class extends Error {},
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({
  provisionAndRouteStaff: vi.fn(),
  syncStaffUserEmail: vi.fn(),
  OrphanedStaffSessionError,
}))
vi.mock('@/modules/players/player.service', () => ({ getOrCreatePlayer: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/shared/observability', () => ({
  track: { auth: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => Promise<unknown>) => fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionAndRouteStaff } from '@/modules/auth/auth.service'
import { getOrCreatePlayer } from '@/modules/players/player.service'
import { GET } from '@/app/api/auth/callback/route'

const mockSignOut = vi.fn()
const mockUpdateUserById = vi.fn()

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/auth/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function verifyOtpUser(user: unknown): void {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      verifyOtp: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({}),
      signOut: mockSignOut,
    },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateUserById.mockResolvedValue({ error: null })
  vi.mocked(createAdminClient).mockReturnValue({
    auth: { admin: { updateUserById: mockUpdateUserById } },
  } as never)
  vi.mocked(provisionAndRouteStaff).mockResolvedValue({ path: '/dashboard' })
  vi.mocked(getOrCreatePlayer).mockResolvedValue({
    id: 'player-1',
    wasCreated: true,
    hasAgreedTerms: true,
  })
})

describe('GET /api/auth/callback — is_player en user_metadata (token_hash)', () => {
  it('alta de jugador sin claims todavía: provisiona al jugador y graba app_metadata', async () => {
    verifyOtpUser({
      id: 'auth-1',
      email: 'jugador@example.com',
      app_metadata: {},
      user_metadata: { is_player: true, first_name: 'Tomás', agreed_terms: true },
    })

    await GET(makeRequest({ token_hash: 'tok-123', type: 'signup' }))

    expect(getOrCreatePlayer).toHaveBeenCalledTimes(1)
    expect(mockUpdateUserById).toHaveBeenCalledWith('auth-1', {
      app_metadata: { is_player: true, player_id: 'player-1' },
    })
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
  })

  it('cuenta con claims de staff e is_player en user_metadata: entra como staff, sin account_conflict', async () => {
    const user = {
      id: 'auth-2',
      email: 'empleado@complejo.com',
      app_metadata: { staff_user_id: 'staff-1', tenant_id: 'tenant-1', role: 'manager' },
      user_metadata: { is_player: true },
    }
    verifyOtpUser(user)

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'invite' }))

    expect(provisionAndRouteStaff).toHaveBeenCalledWith(user)
    expect(getOrCreatePlayer).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBeNull()
  })

  it('staff_user_id huérfano: cierra solo esta sesión y manda a /verify?error=orphaned_session', async () => {
    verifyOtpUser({
      id: 'auth-3',
      email: 'empleado@complejo.com',
      app_metadata: { staff_user_id: 'staff-borrado' },
      user_metadata: {},
    })
    vi.mocked(provisionAndRouteStaff).mockRejectedValueOnce(new OrphanedStaffSessionError())

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'email' }))

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('orphaned_session')
  })
})

// Los tres emisores del jugador marcan el enlace con `via=email`; las altas,
// invitaciones y cambios de email del staff no. Con la marca, una cuenta que NO es
// de jugador (complejo o super admin) se rechaza ANTES de provisionAndRouteStaff,
// que le crearía una fila staff_users espuria y la mandaría a /onboarding.
describe('GET /api/auth/callback — marca de vía del jugador (token_hash)', () => {
  const SUPER_ADMIN = { app_metadata: { is_system_admin: true }, user_metadata: {} }

  it.each([
    ['empleado de un complejo', { app_metadata: { tenant_id: 't1', staff_user_id: 's1' } }],
    ['super admin', SUPER_ADMIN],
    ['cuenta sin claims ni is_player', { app_metadata: {}, user_metadata: {} }],
  ])('con via=email, %s -> account_conflict, cierra solo esta sesión', async (_name, account) => {
    verifyOtpUser({ id: 'auth-4', email: 'cuenta@example.com', ...account })

    const res = await GET(
      makeRequest({ token_hash: 'tok-123', type: 'email', via: 'email', next: '/mis-reservas' }),
    )

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
    expect(getOrCreatePlayer).not.toHaveBeenCalled()
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/verify')
    expect(location.searchParams.get('error')).toBe('account_conflict')
    expect(location.searchParams.get('via')).toBe('email')
    expect(location.searchParams.get('next')).toBe('/mis-reservas')
  })

  it('con via=email, el jugador nuevo (is_player en user_metadata) se provisiona igual', async () => {
    verifyOtpUser({
      id: 'auth-5',
      email: 'jugador@example.com',
      app_metadata: {},
      user_metadata: { is_player: true, agreed_terms: true },
    })

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'signup', via: 'email' }))

    expect(getOrCreatePlayer).toHaveBeenCalledTimes(1)
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(new URL(res.headers.get('location')!).searchParams.get('status')).toBe('success')
  })

  it.each(['signup', 'invite', 'email_change'])(
    'SIN marca, type=%s sigue el camino de staff (mismo super admin que arriba)',
    async (type) => {
      verifyOtpUser({ id: 'auth-6', email: 'cuenta@example.com', ...SUPER_ADMIN })

      const res = await GET(makeRequest({ token_hash: 'tok-123', type }))

      expect(provisionAndRouteStaff).toHaveBeenCalledTimes(1)
      expect(mockSignOut).not.toHaveBeenCalled()
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBeNull()
    },
  )

  it('recovery va a /reset-password y no provisiona nada', async () => {
    verifyOtpUser({ id: 'auth-7', email: 'cuenta@example.com', ...SUPER_ADMIN })

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'recovery' }))

    expect(new URL(res.headers.get('location')!).pathname).toBe('/reset-password')
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})
