import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    static tokenBucket(limit: number) { return { limit } }
    constructor(_: unknown) {}
    async limit(_: string): Promise<never> { throw new Error('redis-down') }
  }
  return { Ratelimit: FakeRatelimit }
})

import { enforce } from '@/shared/rate-limit/apply'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
  __resetLimitersForTests()
})

describe('fail-mode behavior when Redis is unreachable', () => {
  it('publicAvailability fails OPEN (allow + unavailable=true)', async () => {
    const r = await enforce('publicAvailability', '1.2.3.4')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })
  it('adminCrud fails OPEN', async () => {
    const r = await enforce('adminCrud', 'tenant-x')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })
  it('playerBooking fails OPEN', async () => {
    const r = await enforce('playerBooking', 'player-x')
    expect(r.ok).toBe(true)
    expect(r.unavailable).toBe(true)
  })
  it('authMagicLink fails CLOSED (deny)', async () => {
    const r = await enforce('authMagicLink', 'a@b.com')
    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(true)
  })
  it('authVerify fails CLOSED', async () => {
    const r = await enforce('authVerify', '1.2.3.4')
    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(true)
  })
})
