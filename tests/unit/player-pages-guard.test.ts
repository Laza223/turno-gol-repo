import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sin sesión de jugador: cada page del grupo `(player)` tiene que mandar a /ingresar con SU `next`
// (el layout no puede: no conoce el pathname y antes mandaba todo a /mis-reservas).
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn(async () => null) }))
vi.mock('@/modules/auth/sign-out.action', () => ({ signOutAction: vi.fn() }))
vi.mock('@/shared/db/client', () => ({ withPlayerContext: vi.fn() }))
vi.mock('@/modules/favorites/favorite.service', () => ({ getFavorites: vi.fn() }))
vi.mock('@/modules/tenants/search.service', () => ({ searchPublicTenants: vi.fn() }))
vi.mock('@/modules/players/activity.service', () => ({
  computeStreakWeeks: vi.fn(),
  getPlayerActivity: vi.fn(),
  isoMondayOf: vi.fn(),
}))
vi.mock('@/modules/players/player.anonymization', () => ({
  anonymizePlayer: vi.fn(),
  PlayerAlreadyAnonymizedError: class extends Error {},
  PlayerNotFoundError: class extends Error {},
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/modules/bookings/cancellation-preview', () => ({ getCancellationPreview: vi.fn() }))

import ConfiguracionPage from '@/app/(player)/configuracion/page'
import EliminarCuentaPage from '@/app/(player)/eliminar-cuenta/page'
import MisReservasPage from '@/app/(player)/mis-reservas/page'
import PerfilPage from '@/app/(player)/perfil/page'

async function destino(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (err) {
    return (err as Error).message.replace('REDIRECT:', '')
  }
  throw new Error('no redirigió')
}

const next = (path: string) => `/ingresar?next=${encodeURIComponent(path)}`

beforeEach(() => vi.clearAllMocks())

describe('(player): cada ruta sin sesión conserva su destino', () => {
  it('/configuracion -> next=/configuracion', async () => {
    expect(await destino(() => ConfiguracionPage())).toBe(next('/configuracion'))
  })

  it('/eliminar-cuenta -> next=/eliminar-cuenta', async () => {
    expect(await destino(() => EliminarCuentaPage())).toBe(next('/eliminar-cuenta'))
  })

  it('/mis-reservas -> next=/mis-reservas, y el historial conserva su pestaña', async () => {
    expect(await destino(() => MisReservasPage({ searchParams: Promise.resolve({}) }))).toBe(
      next('/mis-reservas'),
    )
    expect(
      await destino(() => MisReservasPage({ searchParams: Promise.resolve({ tab: 'historial' }) })),
    ).toBe(next('/mis-reservas?tab=historial'))
  })

  it('/perfil redirige a /configuracion, que es la que guarda el destino', async () => {
    expect(await destino(() => PerfilPage({ searchParams: Promise.resolve({}) }))).toBe(
      '/configuracion',
    )
  })
})

describe('(player)/layout no tiene guard propio', () => {
  it('el layout no importa redirect: perdería el destino de la ruta pedida', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../src/app/(player)/layout.tsx'), 'utf8')
    expect(src).not.toMatch(/redirect\(/)
    expect(src).not.toMatch(/next\/navigation/)
  })
})
