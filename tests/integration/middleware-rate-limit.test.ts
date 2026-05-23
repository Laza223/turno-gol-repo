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
        reset: Date.now() + 60_000,
      }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

import { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { middleware } from '../../middleware'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

function mkReq(path: string, ip: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: { 'x-forwarded-for': ip },
  })
}

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

describe('root middleware rate limit', () => {
  it('passes through non-matched paths', async () => {
    const res = await middleware(mkReq('/some/other', '1.2.3.4'))
    expect(res.status).toBeLessThan(400)
  })

  it('public/availability: 30 OK, 31st returns 429', async () => {
    for (let i = 0; i < 30; i++) {
      const r = await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '1.2.3.4'))
      expect(r.status).not.toBe(429)
    }
    const r = await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '1.2.3.4'))
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBeTruthy()
  })

  it('auth/callback: 10 OK, 11th returns 429', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await middleware(mkReq('/api/auth/callback', '5.6.7.8'))
      expect(r.status).not.toBe(429)
    }
    const r = await middleware(mkReq('/api/auth/callback', '5.6.7.8'))
    expect(r.status).toBe(429)
  })

  it('different IPs do not share buckets', async () => {
    for (let i = 0; i < 30; i++) await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '1.1.1.1'))
    const r = await middleware(mkReq('/api/public/availability?slug=x&date=2026-05-22', '2.2.2.2'))
    expect(r.status).not.toBe(429)
  })
})
