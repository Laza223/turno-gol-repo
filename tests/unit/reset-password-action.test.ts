import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUser, updateUser, refreshSession, adminUpdateUserById } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null })),
  refreshSession: vi.fn(async () => ({ error: null })),
  adminUpdateUserById: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser, updateUser, refreshSession } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById: adminUpdateUserById } } }),
}))

import { resetPasswordAction } from '@/app/(auth)/reset-password/actions'

function fd(password = 'unaClaveSegura', confirm = 'unaClaveSegura'): FormData {
  const f = new FormData()
  f.set('password', password)
  f.set('confirmPassword', confirm)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  updateUser.mockResolvedValue({ error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'u1', app_metadata: {} } }, error: null })
})

describe('resetPasswordAction', () => {
  it('contraseñas que no coinciden → error, sin tocar sesión', async () => {
    const res = await resetPasswordAction({ status: 'idle' }, fd('unaClaveSegura', 'otra'))
    expect(res.status).toBe('error')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('password corta → error', async () => {
    const res = await resetPasswordAction({ status: 'idle' }, fd('corta', 'corta'))
    expect(res.status).toBe('error')
  })

  it('sin sesión activa → error de enlace expirado', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await resetPasswordAction({ status: 'idle' }, fd())
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.message).toMatch(/expir|sesión/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('recovery normal → actualiza la contraseña y devuelve la ruta para navegar', async () => {
    const res = await resetPasswordAction({ status: 'idle' }, fd())
    expect(res).toEqual({ status: 'success', path: '/dashboard' })
    expect(updateUser).toHaveBeenCalledWith({ password: 'unaClaveSegura' })
    expect(adminUpdateUserById).not.toHaveBeenCalled()
  })

  it('cambio forzado → limpia force_password_change y refresca la sesión', async () => {
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'u1', app_metadata: { force_password_change: true, tenant_id: 't1' } } },
      error: null,
    })
    const res = await resetPasswordAction({ status: 'idle' }, fd())
    expect(res).toEqual({ status: 'success', path: '/dashboard' })
    expect(adminUpdateUserById).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ force_password_change: null }),
      }),
    )
    expect(refreshSession).toHaveBeenCalled()
  })
})
