import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signUpStaff, dbLimit, getDb } = vi.hoisted(() => ({
  signUpStaff: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; error: string }),
  dbLimit: vi.fn(async () => [] as Array<{ id: string }>),
  // caza-bugs (6ta oleada): staff_users tiene RLS relacional que exige
  // app.current_tenant_id — inexistente en este punto del registro. getDb()
  // (pool restringido) es la trampa: si el código volviera a usarlo en vez de
  // getWorkerDb(), este mock explota en vez de devolver 0 filas silenciosas.
  getDb: vi.fn(() => {
    throw new Error('TRAP: getDb() no debe usarse acá — staff_users necesita getWorkerDb()')
  }),
}))

vi.mock('next/headers', () => ({
  headers: () => ({ get: () => 'http://localhost:3000' }),
}))
vi.mock('@/modules/auth/auth.service', () => ({ signUpStaff }))
vi.mock('@/shared/db/client', () => ({
  getDb,
  getWorkerDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: dbLimit }) }) }),
  }),
}))

// enforce fail-closea sin Upstash y NODE_ENV='test' no dispara su bypass; sin
// este mock cada alta devuelve "Demasiados intentos". Rate-limit real → integration.
vi.mock('@/shared/rate-limit/apply', () => ({
  enforce: vi.fn(async () => ({
    ok: true,
    limit: 100,
    remaining: 99,
    reset: 0,
    unavailable: false,
  })),
}))

import { registerAction, type RegisterState } from '@/app/(auth)/register/actions'

const idle: RegisterState = { status: 'idle' }

function makeForm(overrides: Partial<Record<string, string>> = {}): FormData {
  const f = new FormData()
  f.set('email', overrides.email ?? 'Marce@Complejo.com')
  f.set('firstName', overrides.firstName ?? 'Marcelo')
  f.set('lastName', overrides.lastName ?? 'Gómez')
  f.set('phone', overrides.phone ?? '+54 9 11 1234-5678')
  f.set('password', overrides.password ?? 'unaClaveSegura')
  f.set('confirmPassword', overrides.confirmPassword ?? 'unaClaveSegura')
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  dbLimit.mockResolvedValue([])
  signUpStaff.mockResolvedValue({ ok: true })
})

describe('registerAction email+password (#41 / auth migration)', () => {
  it('si el email ya existe en staff_users informa "existing" y NO crea cuenta', async () => {
    dbLimit.mockResolvedValueOnce([{ id: 'staff-1' }])

    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('existing')
    if (res.status === 'existing') expect(res.email).toBe('marce@complejo.com')
    expect(signUpStaff).not.toHaveBeenCalled()
    expect(getDb).not.toHaveBeenCalled()
  })

  it('si el email es nuevo crea la cuenta y queda en "confirm"', async () => {
    dbLimit.mockResolvedValueOnce([])

    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('confirm')
    expect(signUpStaff).toHaveBeenCalledTimes(1)
  })

  it('si la verificación de email falla no bloquea el alta y sigue al signUp', async () => {
    dbLimit.mockRejectedValueOnce(new Error('db down'))

    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('confirm')
    expect(signUpStaff).toHaveBeenCalledTimes(1)
  })

  it('email inválido devuelve error de campo sin tocar DB ni Supabase', async () => {
    const res = await registerAction(idle, makeForm({ email: 'no-es-email' }))

    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.fieldErrors.email).toBeTruthy()
    expect(dbLimit).not.toHaveBeenCalled()
    expect(signUpStaff).not.toHaveBeenCalled()
  })

  it('password corta (<8) devuelve error de campo y no crea cuenta', async () => {
    const res = await registerAction(
      idle,
      makeForm({ password: 'corta', confirmPassword: 'corta' }),
    )

    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.fieldErrors.password).toBeTruthy()
    expect(signUpStaff).not.toHaveBeenCalled()
  })

  it('contraseñas que no coinciden devuelven error en confirmPassword', async () => {
    const res = await registerAction(idle, makeForm({ confirmPassword: 'otraDistinta' }))

    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.fieldErrors.confirmPassword).toBeTruthy()
    expect(signUpStaff).not.toHaveBeenCalled()
  })
})
