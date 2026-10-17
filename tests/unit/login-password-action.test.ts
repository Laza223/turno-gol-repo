import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithPassword, provisionAndRouteStaff, signOut, resend, OrphanedStaffSessionError } =
  vi.hoisted(() => ({
    signInWithPassword: vi.fn(),
    provisionAndRouteStaff: vi.fn(async () => ({ path: '/dashboard' })),
    signOut: vi.fn(async () => ({ error: null })),
    resend: vi.fn(async () => ({ error: null })),
    OrphanedStaffSessionError: class extends Error {},
  }))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithPassword,
  provisionAndRouteStaff,
  OrphanedStaffSessionError,
  signInWithExistingPlayerMagicLink: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { resend, signOut } }),
}))
vi.mock('next/headers', () => ({ headers: () => new Headers({ origin: 'http://localhost:3000' }) }))
// El rate limiter fail-closea sin Upstash y NODE_ENV='test' no dispara el bypass
// de enforce → sin este mock, cada acción devuelve "Demasiados intentos". El
// rate-limit real se cubre en tests/integration/login-rate-limit.test.ts.
vi.mock('@/shared/rate-limit/apply', () => ({
  enforce: vi.fn(async () => ({
    ok: true,
    limit: 100,
    remaining: 99,
    reset: 0,
    unavailable: false,
  })),
}))

import { loginAction, resendConfirmationAction } from '@/app/(auth)/login/actions'

function fd(password = 'unaClaveSegura'): FormData {
  const f = new FormData()
  f.set('email', 'marce@complejo.com')
  f.set('password', password)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  provisionAndRouteStaff.mockResolvedValue({ path: '/dashboard' })
})

describe('loginAction (email + password)', () => {
  it('credenciales inválidas → error genérico, sin provisionar', async () => {
    signInWithPassword.mockResolvedValueOnce({ ok: false, code: 'invalid_credentials' })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res.status).toBe('error')
    if (res.status === 'error') {
      expect(res.message).toMatch(/incorrect/i)
      expect(res.unconfirmedEmail).toBeUndefined()
    }
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
  })

  it('email sin confirmar → error con unconfirmedEmail para ofrecer reenvío', async () => {
    signInWithPassword.mockResolvedValueOnce({ ok: false, code: 'email_not_confirmed' })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.unconfirmedEmail).toBe('marce@complejo.com')
  })

  it('zod inválido (password corta) → error genérico sin llamar a Supabase', async () => {
    const res = await loginAction({ status: 'idle' }, fd('corta'))
    expect(res.status).toBe('error')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('login OK → provisiona y devuelve la ruta resuelta para navegar', async () => {
    signInWithPassword.mockResolvedValueOnce({ ok: true, user: { id: 'u1', app_metadata: {} } })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res).toEqual({ status: 'success', path: '/dashboard' })
    expect(provisionAndRouteStaff).toHaveBeenCalledTimes(1)
  })

  it('login OK con force_password_change → success a /reset-password sin provisionar', async () => {
    signInWithPassword.mockResolvedValueOnce({
      ok: true,
      user: { id: 'u1', app_metadata: { force_password_change: true } },
    })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res).toEqual({ status: 'success', path: '/reset-password' })
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
  })

  it('jugador (is_player en app_metadata) → cierra sesión y error genérico, sin provisionar', async () => {
    signInWithPassword.mockResolvedValueOnce({
      ok: true,
      user: { id: 'u1', app_metadata: { is_player: true, player_id: 'p1' }, user_metadata: {} },
    })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res.status).toBe('error')
    // Local: la sesión que acaba de abrir este intento, no las del jugador en otros dispositivos.
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
  })

  it('staff con staff_user_id huérfano → cierra solo esta sesión y pide reloguear', async () => {
    signInWithPassword.mockResolvedValueOnce({
      ok: true,
      user: { id: 'u1', app_metadata: { staff_user_id: 's1' }, user_metadata: {} },
    })
    provisionAndRouteStaff.mockRejectedValueOnce(new OrphanedStaffSessionError())
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res.status).toBe('error')
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('staff con is_player adulterado en user_metadata → entra igual', async () => {
    signInWithPassword.mockResolvedValueOnce({
      ok: true,
      user: {
        id: 'u1',
        app_metadata: { staff_user_id: 's1', tenant_id: 't1' },
        user_metadata: { is_player: true },
      },
    })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res).toEqual({ status: 'success', path: '/dashboard' })
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('resendConfirmationAction', () => {
  it('el emailRedirectTo trae "?": confirmation.html le concatena "&token_hash=…"', async () => {
    const f = new FormData()
    f.set('email', 'marce@complejo.com')

    const res = await resendConfirmationAction({ status: 'idle' }, f)

    expect(res).toEqual({ status: 'sent' })
    // Sin el `?next=` la URL quedaba `/api/auth/callback&token_hash=…`: link roto.
    // Mismo valor que usa el alta (register/actions.ts).
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'marce@complejo.com',
      options: { emailRedirectTo: 'http://localhost:3000/api/auth/callback?next=%2Fonboarding' },
    })
  })
})
