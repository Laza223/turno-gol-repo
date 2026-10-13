import { describe, expect, it, vi } from 'vitest'

// `user_metadata` lo edita el propio usuario (`auth.updateUser({ data })`), así
// que su `is_player` solo cuenta en la ventana de alta: mientras app_metadata no
// tenga claims de staff/superadmin. Antes una cuenta staff con `is_player` en
// user_metadata se clasificaba como jugador y quedaba afuera del panel.

// React.cache no existe en el build de react que resuelve vitest (node):
// fallback identidad, mismo patrón que middleware.test.ts.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: actual.cache ?? (<T>(fn: T): T => fn) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { extractRealAuthUser } from '@/modules/auth/auth.middleware'

function sessionUser(
  appMetadata: Record<string, unknown>,
  userMetadata: Record<string, unknown>,
): void {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'auth-1',
            email: 'x@complejo.com',
            app_metadata: appMetadata,
            user_metadata: userMetadata,
          },
        },
        error: null,
      }),
    },
  } as never)
}

describe('extractRealAuthUser — is_player en user_metadata', () => {
  it('staff con is_player adulterado en user_metadata sigue siendo staff', async () => {
    sessionUser({ staff_user_id: 'staff-1', tenant_id: 'tenant-1' }, { is_player: true })

    expect(await extractRealAuthUser()).toMatchObject({
      type: 'staff',
      staffUserId: 'staff-1',
      tenantId: 'tenant-1',
    })
  })

  it('superadmin con is_player adulterado en user_metadata sigue siendo superadmin', async () => {
    sessionUser({ is_system_admin: true }, { is_player: true })

    expect(await extractRealAuthUser()).toMatchObject({ type: 'system_admin' })
  })

  it('alta de jugador (todavía sin claims en app_metadata): user_metadata alcanza', async () => {
    sessionUser({}, { is_player: true })

    expect(await extractRealAuthUser()).toMatchObject({ type: 'player' })
  })

  it('jugador con is_player en app_metadata', async () => {
    sessionUser({ is_player: true, player_id: 'player-1' }, {})

    expect(await extractRealAuthUser()).toMatchObject({ type: 'player', playerId: 'player-1' })
  })
})
