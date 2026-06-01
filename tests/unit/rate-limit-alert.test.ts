import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// When Upstash is unreachable, enforce() falls back to the policy's failMode and
// flags unavailable:true. That outage must page us (Sentry warning), but only
// for REAL failures — never on the E2E bypass, and deduped so a sustained outage
// doesn't flood Sentry with one event per request.
const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E

vi.mock('@/lib/sentry', () => ({ captureMessage: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor(_: unknown) {} } }))
vi.mock('@upstash/ratelimit', () => {
  class FakeRatelimit {
    static tokenBucket(): { kind: string } {
      return { kind: 'tokenBucket' }
    }
    constructor(_: unknown) {}
    async limit(_key: string): Promise<never> {
      throw new Error('redis-down')
    }
  }
  return { Ratelimit: FakeRatelimit }
})

import { captureMessage } from '@/lib/sentry'
import { enforce, __resetLimiterAlertsForTests } from '@/shared/rate-limit/apply'
import { __resetLimitersForTests } from '@/shared/rate-limit/client'

const mockCapture = vi.mocked(captureMessage)

beforeEach(() => {
  __resetLimitersForTests()
  __resetLimiterAlertsForTests()
  vi.clearAllMocks()
  delete process.env.NEXT_PUBLIC_E2E
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token'
})

afterEach(() => {
  if (ORIGINAL_E2E !== undefined) process.env.NEXT_PUBLIC_E2E = ORIGINAL_E2E
})

describe('rate limiter unavailable alerting', () => {
  it('sends a Sentry warning naming the policy when Upstash throws', async () => {
    await enforce('adminCrud', 'tenant-1')
    expect(mockCapture).toHaveBeenCalledTimes(1)
    const [msg, ctx] = mockCapture.mock.calls[0]!
    expect(String(msg)).toContain('adminCrud')
    expect((ctx as { level?: string }).level).toBe('warning')
  })

  it('deduplicates alerts within the cooldown window (no flood)', async () => {
    await enforce('adminCrud', 'tenant-1')
    await enforce('adminCrud', 'tenant-2')
    await enforce('adminCrud', 'tenant-3')
    expect(mockCapture).toHaveBeenCalledTimes(1)
  })

  it('does NOT alert on the E2E bypass (unavailable but not a real outage)', async () => {
    process.env.NEXT_PUBLIC_E2E = '1'
    await enforce('authVerify', '1.2.3.4')
    expect(mockCapture).not.toHaveBeenCalled()
  })
})
