import { beforeEach, describe, expect, it, vi } from 'vitest'

// PIN rate-limit was added in B6 (brute-force defense). Mock Upstash so the
// existing happy-path tests below aren't blocked by the new pinAttempts policy.
vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    constructor(_: unknown) {}
    async limit(_key: string) {
      return { success: true, limit: 5, remaining: 5, reset: Date.now() + 60_000 }
    }
  }
  return { Ratelimit: FakeRatelimit }
})

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
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  __resetLimitersForTests()
})

describe('checkPinSessionAction', () => {
  it('returns false when no cookie', async () => {
    const { checkPinSessionAction } = await import('@/app/(admin)/actions/pin')
    const result = await checkPinSessionAction()
    expect(result).toBe(false)
  })
})

describe('verifyPinAction', () => {
  it('returns ok:false, locked:false, attemptsLeft when PIN invalid', async () => {
    vi.mocked(verifyPin).mockResolvedValueOnce(false)
    const { verifyPinAction } = await import('@/app/(admin)/actions/pin')
    const result = await verifyPinAction('0000')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('PIN incorrecto.')
      expect(result.locked).toBe(false)
      // attemptsLeft is number because FakeRatelimit always returns remaining=5
      expect(typeof (result as { attemptsLeft?: number }).attemptsLeft).toBe('number')
    }
  })

  it('returns ok:true when PIN valid', async () => {
    vi.mocked(verifyPin).mockResolvedValueOnce(true)
    const { verifyPinAction } = await import('@/app/(admin)/actions/pin')
    const result = await verifyPinAction('1234')
    expect(result).toEqual({ ok: true })
  })
})
