import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Rama token_hash: `user_metadata.is_player` (options.data del magic link) es lo
// que permite provisionar a un jugador nuevo antes de que exista
// app_metadata.is_player. Pero lo edita el propio usuario, así que con claims de
// staff ya grabados no reclasifica: una invitación aceptada por alguien que
// alguna vez empezó un alta de jugador sin confirmarla terminaba en
// account_conflict, afuera del panel. Mismo mocking que
// auth-callback-email-change.test.ts.

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
})
