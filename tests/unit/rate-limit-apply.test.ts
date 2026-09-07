import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `.env.test` sets NEXT_PUBLIC_E2E=1 (loaded by tests/setup.ts) so the rest of
// the suite can exercise E2E-bypassed flows. This file is the ONLY one that
// tests the REAL `enforce` path (throttling + fail-open/closed), so the bypass
// must be off here. Capture and restore so we don't leak into later files.
const ORIGINAL_E2E = process.env.NEXT_PUBLIC_E2E

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(_: unknown) {}
  },
}))

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
      if (throwOnNext) {
        throwOnNext = false
        throw new Error('redis-down')
      }
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
    static __throwOnNext() {
      throwOnNext = true
    }
    static __reset() {
      counts.clear()
      throwOnNext = false
    }
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
      ok: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
      unavailable: false,
    })
    expect(res.status).toBe(429)
    const retry = Number(res.headers.get('retry-after'))
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(60)
    const body = await res.json()
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(typeof body.error.message).toBe('string')
    expect(body.meta).toHaveProperty('request_id')
  })
})

/**
 * Hardening de la auditoría integral del 2026-09-06.
 *
 * `NEXT_PUBLIC_E2E=1` apaga el rate limiting entero. Que "nunca se setea en un
 * entorno real" era una convención escrita en un comentario, no un candado — y
 * el prefijo `NEXT_PUBLIC_` significa que la variable viaja al bundle, así que
 * alcanza con que quede cargada una vez en el proyecto de Vercel para dejar
 * producción sin límites, en silencio y sin que ningún test lo note.
 *
 * `MP_MOCK_ENABLED` apaga una defensa del mismo calibre y ya estaba
 * duro-gateada por el runtime. Ahora esta también.
 */
describe('el bypass de E2E no puede quedar prendido en producción', () => {
  // `NODE_ENV` es readonly en los tipos de Node; el resto del repo usa este
  // mismo cast para poder simular entornos (ver webhook-auth.test.ts).
  const env = process.env as Record<string, string | undefined>
  const ORIGINAL_VERCEL_ENV = env['VERCEL_ENV']
  const ORIGINAL_NODE_ENV = env['NODE_ENV']

  afterEach(() => {
    if (ORIGINAL_VERCEL_ENV === undefined) delete env['VERCEL_ENV']
    else env['VERCEL_ENV'] = ORIGINAL_VERCEL_ENV
    if (ORIGINAL_NODE_ENV === undefined) delete env['NODE_ENV']
    else env['NODE_ENV'] = ORIGINAL_NODE_ENV
    delete env['NEXT_PUBLIC_E2E']
  })

  it('en el deploy de producción real la variable NO desactiva nada', async () => {
    env['NODE_ENV'] = 'production'
    env['VERCEL_ENV'] = 'production'
    env['NEXT_PUBLIC_E2E'] = '1'

    for (let i = 0; i < 30; i++) await enforce('publicAvailability', 'prod-key')
    const r = await enforce('publicAvailability', 'prod-key')

    expect(r.ok).toBe(false)
    expect(r.unavailable).toBe(false)
  })

  it('en un deploy de preview sí desactiva: ahí es donde corre Playwright', async () => {
    env['NODE_ENV'] = 'production'
    env['VERCEL_ENV'] = 'preview'
    env['NEXT_PUBLIC_E2E'] = '1'

    for (let i = 0; i < 40; i++) {
      const r = await enforce('publicAvailability', 'preview-key')
      expect(r.ok).toBe(true)
    }
  })

  it('en local/CI (NODE_ENV != production) sigue desactivando como siempre', async () => {
    env['NODE_ENV'] = 'test'
    delete env['VERCEL_ENV']
    env['NEXT_PUBLIC_E2E'] = '1'

    for (let i = 0; i < 40; i++) {
      const r = await enforce('publicAvailability', 'local-key')
      expect(r.ok).toBe(true)
    }
  })
})
