import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateUser = vi.fn()
const signOut = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'u1', app_metadata: {} } },
        error: null,
      })),
      updateUser,
      signOut,
    },
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({ touchStaffLastLogin: vi.fn() }))
vi.mock('@/modules/auth/impersonation.server', () => ({
  getImpersonationSession: vi.fn().mockResolvedValue(null),
}))

import { captureException } from '@/lib/sentry'
import { resetPasswordAction } from './actions'

function form() {
  const fd = new FormData()
  fd.set('password', 'Una-clave-larga-123')
  fd.set('confirmPassword', 'Una-clave-larga-123')
  return fd
}

describe('resetPasswordAction — cierra las otras sesiones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateUser.mockResolvedValue({ error: null })
    signOut.mockResolvedValue({ error: null })
  })

  it('tras cambiar la contraseña hace signOut scope others', async () => {
    const res = await resetPasswordAction({ status: 'idle' }, form())
    expect(res).toEqual({ status: 'success', path: '/dashboard' })
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('si el signOut falla, igual termina bien y lo reporta', async () => {
    signOut.mockRejectedValue(new Error('boom'))
    const res = await resetPasswordAction({ status: 'idle' }, form())
    expect(res.status).toBe('success')
    expect(captureException).toHaveBeenCalled()
  })

  it('si updateUser falla, no cierra sesiones', async () => {
    updateUser.mockResolvedValue({ error: { code: 'x', message: 'x' } })
    await resetPasswordAction({ status: 'idle' }, form())
    expect(signOut).not.toHaveBeenCalled()
  })
})
