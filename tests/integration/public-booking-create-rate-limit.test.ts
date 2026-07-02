import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Ratelimit } from '@upstash/ratelimit'
import { guard } from '@/shared/rate-limit/route-guard'
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

describe('publicBookingCreate rate limit (5/min por ip+tenant)', () => {
  it('5 OK, 6th throttled', async () => {
    const ip = '9.9.9.9'
    for (let i = 0; i < 5; i++) expect(await guard('publicBookingCreate', ip)).toBeNull()
    const r = await guard('publicBookingCreate', ip)
    expect(r?.status).toBe(429)
  })

  it('different IPs do not share buckets', async () => {
    for (let i = 0; i < 5; i++) await guard('publicBookingCreate', '1.1.1.1')
    expect(await guard('publicBookingCreate', '2.2.2.2')).toBeNull()
  })

  it('same IP, different tenants (slugs) do not share buckets', async () => {
    const ip = '3.3.3.3'
    const slugA = 'complejo-a'
    const slugB = 'complejo-b'
    for (let i = 0; i < 5; i++) expect(await guard('publicBookingCreate', `${ip}:${slugA}`)).toBeNull()
    expect(await guard('publicBookingCreate', `${ip}:${slugA}`)).not.toBeNull()
    expect(await guard('publicBookingCreate', `${ip}:${slugB}`)).toBeNull()
  })
})

describe('createBookingAndCheckout enforces publicBookingCreate', () => {
  it('calls enforce("publicBookingCreate", ip) before creating the hold', () => {
    const file = path.resolve(__dirname, '../../src/app/(public)/[slug]/reservar/actions.ts')
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/enforce\(\s*['"]publicBookingCreate['"]/)
  })
})
