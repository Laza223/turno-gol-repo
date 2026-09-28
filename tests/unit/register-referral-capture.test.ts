import { beforeEach, describe, expect, it, vi } from 'vitest'

// B2: captura del código de referido en el alta de staff. Mismo esquema de
// mocks que register-existing-account.test.ts.

const { signUpStaff, dbLimit, getDb } = vi.hoisted(() => ({
  signUpStaff: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; error: string }),
  dbLimit: vi.fn(async () => [] as Array<{ id: string }>),
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
  if (overrides.referralCode !== undefined) f.set('referralCode', overrides.referralCode)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  dbLimit.mockResolvedValue([])
  signUpStaff.mockResolvedValue({ ok: true })
})

describe('registerAction — captura del código de referido (B2)', () => {
  it('con referralCode válido en el form, lo manda a signUpStaff', async () => {
    const res = await registerAction(idle, makeForm({ referralCode: 'AH2K9MZP' }))

    expect(res.status).toBe('confirm')
    expect(signUpStaff).toHaveBeenCalledWith(
      expect.objectContaining({ referralCode: 'AH2K9MZP' }),
      expect.any(String),
    )
  })

  it('con referralCode de formato inválido, se descarta en silencio y no bloquea el alta', async () => {
    const res = await registerAction(idle, makeForm({ referralCode: 'no-es-un-codigo' }))

    expect(res.status).toBe('confirm')
    expect(signUpStaff).toHaveBeenCalledWith(
      expect.objectContaining({ referralCode: null }),
      expect.any(String),
    )
  })

  it('sin referralCode en el form, manda null', async () => {
    const res = await registerAction(idle, makeForm())

    expect(res.status).toBe('confirm')
    expect(signUpStaff).toHaveBeenCalledWith(
      expect.objectContaining({ referralCode: null }),
      expect.any(String),
    )
  })
})
