import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// `.env.test` sets NEXT_PUBLIC_E2E=1 which makes `enforce` short-circuit and
// never throttle. This file tests the REAL enforce path; capture + restore.
const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E

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
        reset: Date.now() + 60_000,
      }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

// Stub the signInWithMagicLink so the test does not hit Supabase.
vi.mock('@/modules/auth/auth.service', () => ({
  signInWithMagicLink: vi.fn(async () => ({ ok: true })),
}))

// Stub next/headers `headers()` — Server Actions read from it.
vi.mock('next/headers', () => ({
  headers: () => new Headers({ origin: 'http://localhost:3000' }),
}))

import { Ratelimit } from '@upstash/ratelimit'
import { loginAction } from '@/app/(auth)/login/actions'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_E2E
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

afterAll(() => {
  if (ORIGINAL_E2E !== undefined) process.env.NEXT_PUBLIC_E2E = ORIGINAL_E2E
})

function fd(email: string): FormData {
  const f = new FormData()
  f.set('email', email)
  return f
}

describe('loginAction rate limit (5/min per email)', () => {
  it('first 5 attempts succeed; 6th returns RATE_LIMITED', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await loginAction({ status: 'idle' }, fd('a@b.com'))
      expect(res.status).toBe('sent')
    }
    const res = await loginAction({ status: 'idle' }, fd('a@b.com'))
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.message).toMatch(/rate|límite|límit|too many|intentos/i)
  })

  it('different emails do not share buckets', async () => {
    for (let i = 0; i < 5; i++) await loginAction({ status: 'idle' }, fd('a@b.com'))
    const res = await loginAction({ status: 'idle' }, fd('c@d.com'))
    expect(res.status).toBe('sent')
  })

  it('email key is normalized (trim + lowercase) so case variants share the bucket', async () => {
    for (let i = 0; i < 5; i++) await loginAction({ status: 'idle' }, fd('a@b.com'))
    const res = await loginAction({ status: 'idle' }, fd(' A@B.COM '))
    expect(res.status).toBe('error')
  })
})
