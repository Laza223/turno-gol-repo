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

// signInWithPassword devuelve credenciales inválidas: así loginAction NO redirige
// (mensaje genérico) y podemos consumir el bucket sin lanzar NEXT_REDIRECT.
vi.mock('@/modules/auth/auth.service', () => ({
  signInWithPassword: vi.fn(async () => ({ ok: false, code: 'invalid_credentials' })),
  provisionAndRouteStaff: vi.fn(async () => ({ path: '/dashboard' })),
  signInWithExistingPlayerMagicLink: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { resend: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }) }))
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
  f.set('password', 'unaClaveSegura')
  return f
}

const RATE_LIMIT_RE = /demasiados|intentos|minuto/i

describe('loginAction rate limit (authPassword 8/5m per email)', () => {
  it('primeros 8 intentos pasan el limiter (creds inválidas); el 9° es RATE_LIMITED', async () => {
    for (let i = 0; i < 8; i++) {
      const res = await loginAction({ status: 'idle' }, fd('a@b.com'))
      expect(res.status).toBe('error')
      if (res.status === 'error') expect(res.message).not.toMatch(RATE_LIMIT_RE)
    }
    const res = await loginAction({ status: 'idle' }, fd('a@b.com'))
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.message).toMatch(RATE_LIMIT_RE)
  })

  it('emails distintos no comparten bucket', async () => {
    for (let i = 0; i < 8; i++) await loginAction({ status: 'idle' }, fd('a@b.com'))
    const res = await loginAction({ status: 'idle' }, fd('c@d.com'))
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.message).not.toMatch(RATE_LIMIT_RE)
  })

  it('la key se normaliza (trim + lowercase): variantes de mayúsculas comparten bucket', async () => {
    for (let i = 0; i < 8; i++) await loginAction({ status: 'idle' }, fd('a@b.com'))
    const res = await loginAction({ status: 'idle' }, fd(' A@B.COM '))
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.message).toMatch(RATE_LIMIT_RE)
  })
})
