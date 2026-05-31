import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// `.env.test` sets NEXT_PUBLIC_E2E=1 (loaded by tests/setup.ts) so the rest of
// the suite can exercise E2E-bypassed flows. This file is the ONLY one that
// tests the REAL `enforce` path (throttling + fail-open/closed), so the bypass
// must be off here. Capture and restore so we don't leak into later files.
const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))

vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  let throwOnNext = false
  class FakeRatelimit {
    static tokenBucket(limit: number, _w: string, _max: number) {
      return { kind: 'tokenBucket', limit }
    }
    private prefix: string
    private _limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix
      this._limit = opts.limiter.limit
    }
    async limit(key: string) {
      if (throwOnNext) { throwOnNext = false; throw new Error('redis-down') }
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
    static __throwOnNext() { throwOnNext = true }
    static __reset() { counts.clear(); throwOnNext = false }
  }
  return { Ratelimit: FakeRatelimit }
})

import { Ratelimit } from '@upstash/ratelimit'
import { enforce, rateLimit429 } from '@/shared/rate-limit/apply'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
  delete process.env.NEXT_PUBLIC_E2E
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
})

afterAll(() => {
  if (ORIGINAL_E2E !== undefined) process.env.NEXT_PUBLIC_E2E = ORIGINAL_E2E
})

describe('enforce', () => {
  it('publicAvailability: first 30 ok, 31st throttled', async () => {
    for (let i = 0; i < 30; i++) {
      const r = await enforce('publicAvailability', '1.2.3.4')
      expect(r.ok).toBe(true)
    }
    const r = await enforce('publicAvailability', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('keys are scoped by policy AND key', async () => {
    for (let i = 0; i < 30; i++) await enforce('publicAvailability', 'a')
    const r = await enforce('publicAvailability', 'b')
    expect(r.ok).toBe(true)
  })

  it('fail-open: publicAvailability lets request through when Redis throws', async () => {
    ;(Ratelimit as unknown as { __throwOnNext: () => void }).__throwOnNext()
    const r = await enforce('publicAvailability', '1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })

  it('fail-closed: authVerify denies when Redis throws', async () => {
    ;(Ratelimit as unknown as { __throwOnNext: () => void }).__throwOnNext()
    const r = await enforce('authVerify', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(true)
  })
})

describe('rateLimit429', () => {
  it('returns 429 with Retry-After', async () => {
    const res = rateLimit429({
      ok: false, limit: 30, remaining: 0, reset: Date.now() + 60_000, unavailable: false,
    })
    expect(res.status).toBe(429)
    const retry = Number(res.headers.get('retry-after'))
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(60)
    const body = await res.json()
    expect(body).toEqual({ error: 'RATE_LIMITED' })
  })
})
