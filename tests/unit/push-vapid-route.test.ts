import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock next/headers so the route can be imported outside of a Next.js request
// context. The vapid route only reads x-forwarded-for / x-real-ip from it.
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}))

// Mock the rate-limit module: default to allowed (failMode 'open' passthrough).
vi.mock('@/shared/rate-limit', () => ({
  parseClientIp: vi.fn(() => '127.0.0.1'),
  enforce: vi.fn().mockResolvedValue({ ok: true, limit: 5, remaining: 4, reset: Date.now() + 60_000, unavailable: false }),
  rateLimit429: vi.fn(),
}))

import { GET } from '@/app/api/admin/push/vapid/route'

const REAL_KEY = 'B'.repeat(88) // 88-char fake VAPID public key (base64url)

describe('GET /api/admin/push/vapid', () => {
  const originalEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    } else {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalEnv
    }
  })

  it('returns 200 with publicKey when env var is set', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = REAL_KEY

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json() as { publicKey: string }
    expect(json.publicKey).toBe(REAL_KEY)
  })

  it('returns 500 with vapid_not_configured when env var is missing', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    const res = await GET()
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('VAPID_NOT_CONFIGURED')
  })
})
