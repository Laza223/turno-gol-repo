import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  const counts = new Map<string, number>()
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    private prefix: string
    private _limit: number
    constructor(opts: { redis: unknown; limiter: { limit: number }; prefix: string }) {
      this.prefix = opts.prefix; this._limit = opts.limiter.limit
    }
    async limit(key: string) {
      const k = `${this.prefix}:${key}`
      const n = (counts.get(k) ?? 0) + 1
      counts.set(k, n)
      return { success: n <= this._limit, limit: this._limit, remaining: Math.max(0, this._limit - n), reset: Date.now() + 60_000 }
    }
    static __reset() { counts.clear() }
  }
  return { Ratelimit: FakeRatelimit }
})

import { Ratelimit } from '@upstash/ratelimit'
import { guard } from '@/shared/rate-limit/route-guard'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  ;(Ratelimit as unknown as { __reset: () => void }).__reset()
  __resetLimitersForTests()
})

describe('player rate limit (20/min per player_id)', () => {
  it('20 OK, 21st throttled', async () => {
    const pid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    for (let i = 0; i < 20; i++) expect(await guard('playerBooking', pid)).toBeNull()
    const r = await guard('playerBooking', pid)
    expect(r?.status).toBe(429)
  })
})
