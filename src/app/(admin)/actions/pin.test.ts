import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
  })),
}))
vi.mock('@/modules/auth/pin', () => ({
  verifyPin: vi.fn(),
  verifyPinCookie: vi.fn(() => false),
  buildPinCookie: vi.fn(() => 'mock-cookie'),
  COOKIE_NAME: 'tg_pin_session',
  COOKIE_TTL_MS: 1800000,
}))
vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: vi.fn(() => ({
    type: 'staff',
    staffUserId: 'staff-1',
    tenantId: 'tenant-1',
    email: 'test@test.com',
  })),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: vi.fn(() => ({
    id: 'tenant-1',
    settings: { staff_pin_hash: 'hash' },
  })),
}))

import { verifyPin } from '@/modules/auth/pin'

describe('checkPinSessionAction', () => {
  it('returns false when no cookie', async () => {
    const { checkPinSessionAction } = await import('@/app/(admin)/actions/pin')
    const result = await checkPinSessionAction()
    expect(result).toBe(false)
  })
})

describe('verifyPinAction', () => {
  it('returns ok:false when PIN invalid', async () => {
    vi.mocked(verifyPin).mockResolvedValueOnce(false)
    const { verifyPinAction } = await import('@/app/(admin)/actions/pin')
    const result = await verifyPinAction('0000')
    // El lockout de PIN agregó locked/attemptsLeft al contrato (rate limit de 5 intentos).
    expect(result).toEqual({
      ok: false,
      error: 'PIN incorrecto.',
      locked: false,
      attemptsLeft: 5,
    })
  })

  it('returns ok:true when PIN valid', async () => {
    vi.mocked(verifyPin).mockResolvedValueOnce(true)
    const { verifyPinAction } = await import('@/app/(admin)/actions/pin')
    const result = await verifyPinAction('1234')
    expect(result).toEqual({ ok: true })
  })
})
