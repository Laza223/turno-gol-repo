import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Usar otra cuenta de Google" (/verify) reutiliza la action de /ingresar y le
// suma un campo oculto: el selector de cuentas lo pide SOLO ese botón.

const { signInWithGooglePlayer, redirect } = vi.hoisted(() => ({
  signInWithGooglePlayer: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithGooglePlayer,
  signInWithExistingPlayerMagicLink: vi.fn(),
}))
vi.mock('next/headers', () => ({ headers: () => new Headers({ origin: 'http://localhost:3000' }) }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/shared/rate-limit/apply', () => ({ enforce: vi.fn() }))

import { startGoogleLoginFromIngresar } from '@/app/(auth)/ingresar/actions'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  signInWithGooglePlayer.mockResolvedValue({ url: 'https://accounts.google.com/o' })
})

describe('startGoogleLoginFromIngresar', () => {
  it.each([
    ['select_account=1 -> pide el selector de cuentas', { select_account: '1' }, true],
    ['sin el campo (login normal) -> igual que siempre', {}, false],
  ])('%s', async (_name, extra, selectAccount) => {
    await startGoogleLoginFromIngresar(fd({ next: '/club-x/reservar?court=1', ...extra }))

    expect(signInWithGooglePlayer).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/callback?next=%2Fclub-x%2Freservar%3Fcourt%3D1',
      { selectAccount },
    )
    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o')
  })
})
