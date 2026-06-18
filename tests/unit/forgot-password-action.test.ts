import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resetPasswordForEmail } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { resetPasswordForEmail } }),
}))
vi.mock('next/headers', () => ({ headers: () => new Headers({ origin: 'http://localhost:3000' }) }))

import { forgotPasswordAction } from '@/app/(auth)/forgot-password/actions'

function fd(email: string): FormData {
  const f = new FormData()
  f.set('email', email)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('forgotPasswordAction', () => {
  it('email inválido → error, sin disparar reset', async () => {
    const res = await forgotPasswordAction({ status: 'idle' }, fd('no-es-email'))
    expect(res.status).toBe('error')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('email válido → respuesta genérica "sent" y dispara el reset', async () => {
    const res = await forgotPasswordAction({ status: 'idle' }, fd('marce@complejo.com'))
    expect(res.status).toBe('sent')
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'marce@complejo.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('/api/auth/callback') }),
    )
  })
})
