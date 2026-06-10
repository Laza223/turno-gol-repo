import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithOtp, dbLimit } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({ error: null })),
  dbLimit: vi.fn(async () => [] as Array<{ id: string }>),
}))

vi.mock('next/headers', () => ({
  headers: () => ({ get: () => 'http://localhost:3000' }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}))
vi.mock('@/shared/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: dbLimit }) }) }),
  }),
}))

import { registerAction, type RegisterState } from '@/app/(auth)/register/actions'

const idle: RegisterState = { status: 'idle' }

function makeForm(): FormData {
  const f = new FormData()
  f.set('email', 'Marce@Complejo.com')
  f.set('firstName', 'Marcelo')
  f.set('lastName', 'Gómez')
  f.set('phone', '+54 9 11 1234-5678')
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  dbLimit.mockResolvedValue([])
  signInWithOtp.mockResolvedValue({ error: null })
})

describe('registerAction email ya registrado (#41)', () => {
  it('si el email ya existe en staff_users informa "existing" y NO envía magic link', async () => {
    dbLimit.mockResolvedValueOnce([{ id: 'staff-1' }])

    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('existing')
    if (res.status === 'existing') expect(res.email).toBe('marce@complejo.com')
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('si el email es nuevo envía el magic link y queda en "sent"', async () => {
    dbLimit.mockResolvedValueOnce([])

    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('sent')
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
  })

  it('si la verificación de email falla no bloquea el alta y sigue al envío', async () => {
    dbLimit.mockRejectedValueOnce(new Error('db down'))

    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('sent')
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
  })

  it('email inválido devuelve error de campo sin tocar DB ni Supabase', async () => {
    const f = makeForm()
    f.set('email', 'no-es-email')

    const res = await registerAction(idle, f)

    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.fieldErrors.email).toBeTruthy()
    expect(dbLimit).not.toHaveBeenCalled()
    expect(signInWithOtp).not.toHaveBeenCalled()
  })
})
