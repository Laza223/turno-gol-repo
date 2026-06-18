import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithPassword, provisionAndRouteStaff, redirect } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  provisionAndRouteStaff: vi.fn(async () => ({ path: '/dashboard' })),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('@/modules/auth/auth.service', () => ({
  signInWithPassword,
  provisionAndRouteStaff,
  signInWithExistingPlayerMagicLink: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { resend: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/headers', () => ({ headers: () => new Headers({ origin: 'http://localhost:3000' }) }))

import { loginAction } from '@/app/(auth)/login/actions'

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
  it('credenciales inválidas → error genérico, sin redirect', async () => {
    signInWithPassword.mockResolvedValueOnce({ ok: false, code: 'invalid_credentials' })
    const res = await loginAction({ status: 'idle' }, fd())
    expect(res.status).toBe('error')
    if (res.status === 'error') {
      expect(res.message).toMatch(/incorrect/i)
      expect(res.unconfirmedEmail).toBeUndefined()
    }
    expect(redirect).not.toHaveBeenCalled()
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

  it('login OK → provisiona y redirige a la ruta resuelta', async () => {
    signInWithPassword.mockResolvedValueOnce({ ok: true, user: { id: 'u1', app_metadata: {} } })
    await expect(loginAction({ status: 'idle' }, fd())).rejects.toThrow('REDIRECT:/dashboard')
    expect(provisionAndRouteStaff).toHaveBeenCalledTimes(1)
  })

  it('login OK con force_password_change → redirige a /reset-password sin provisionar', async () => {
    signInWithPassword.mockResolvedValueOnce({
      ok: true,
      user: { id: 'u1', app_metadata: { force_password_change: true } },
    })
    await expect(loginAction({ status: 'idle' }, fd())).rejects.toThrow('REDIRECT:/reset-password')
    expect(provisionAndRouteStaff).not.toHaveBeenCalled()
  })
})
