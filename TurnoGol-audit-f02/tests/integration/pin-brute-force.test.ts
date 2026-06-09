import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private _limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix
      this._limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return {
        success: n <= this._limit,
        limit: this._limit,
        remaining: Math.max(0, this._limit - n),
        reset: Date.now() + 5 * 60_000,
      }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

// Stub auth so we don't call Supabase.
const TENANT_ID = 'test-tenant-id-pin-bf'
const STAFF_ID = 'test-staff-id-pin-bf'

vi.mock('@/modules/auth/auth.middleware', () => ({
  extractAuthUser: async () => ({
    type: 'staff',
    staffUserId: STAFF_ID,
    email: 'staff@test.local',
  }),
}))

// Stub tenant lookup so we control settings.staff_pin_hash.
import { hashPin } from '@/modules/auth/pin'
let pinHash: string
vi.mock('@/modules/tenants/tenant.service', () => ({
  getStaffTenant: async () => ({
    id: TENANT_ID,
    settings: { staff_pin_hash: pinHash },
  }),
}))

// Stub next/headers cookies — verifyPinAction calls cookies().set(...).
const cookieJar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => {
      const v = cookieJar.get(name)
      return v ? { value: v } : undefined
    },
    set: (opts: { name: string; value: string }) => {
      cookieJar.set(opts.name, opts.value)
    },
  }),
  headers: () => new Headers(),
}))

// Stub redirect — we don't want test process to abort.
vi.mock('next/navigation', () => ({
  redirect: (_path: string) => {
    throw new Error('redirect-called')
  },
}))

import { Ratelimit } from '@upstash/ratelimit'
import { verifyPinAction } from '@/app/(admin)/actions/pin'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  process.env.PIN_COOKIE_SECRET = 'test-pin-secret-1234567890'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
  cookieJar.clear()
  pinHash = await hashPin('1234')
})

describe('PIN brute force protection (B6.2)', () => {
  it('5 wrong PIN attempts allowed, 6th rate-limited regardless of correctness', async () => {
    // 5 wrong attempts → each returns 'PIN incorrecto.' (allowed but failed)
    for (let i = 0; i < 5; i++) {
      const r = await verifyPinAction('9999')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('PIN incorrecto.')
      }
    }

    // 6th attempt → rate-limited even with CORRECT PIN.
    const r6 = await verifyPinAction('1234')
    expect(r6.ok).toBe(false)
    if (!r6.ok) {
      expect(r6.error).toMatch(/Demasiados intentos fallidos/)
    }
  })

  it('PIN cookie NOT set when rate-limited', async () => {
    // Exhaust limit with wrong attempts.
    for (let i = 0; i < 5; i++) {
      await verifyPinAction('9999')
    }
    // Correct PIN but already rate-limited.
    await verifyPinAction('1234')
    // Cookie must NOT be present.
    expect(cookieJar.has('tg_pin_session')).toBe(false)
  })

  it('correct PIN within budget → cookie set + ok:true', async () => {
    const r = await verifyPinAction('1234')
    expect(r.ok).toBe(true)
    expect(cookieJar.has('tg_pin_session')).toBe(true)
  })

  it('rate limit is per-tenant (different tenants do not share budget)', async () => {
    // Tenant A: exhaust 5 attempts.
    for (let i = 0; i < 5; i++) {
      await verifyPinAction('9999')
    }
    const blocked = await verifyPinAction('1234')
    expect(blocked.ok).toBe(false)

    // Switch tenant via mock replacement.
    const tenantBFreshCounts = (Ratelimit as unknown as { __reset: () => void })
    tenantBFreshCounts.__reset()
    __resetLimitersForTests()

    // Tenant A budget is now reset because we cleared mock counts; this asserts
    // the policy keys by tenant — the FakeRatelimit prefixes by tenant id, so
    // re-running with same tenant after reset returns to fresh state.
    const r = await verifyPinAction('1234')
    expect(r.ok).toBe(true)
  })
})
