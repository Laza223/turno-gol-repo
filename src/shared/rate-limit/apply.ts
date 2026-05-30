import { POLICIES, type PolicyName } from './policies'
import { getLimiter } from './client'

export type RateLimitOutcome = {
  ok: boolean
  limit: number
  remaining: number
  reset: number
  unavailable: boolean
}

export async function enforce(name: PolicyName, key: string): Promise<RateLimitOutcome> {
  // E2E test runs don't have Upstash credentials. Policies with
  // failMode='closed' (authMagicLink, authVerify, pinAttempts) would otherwise
  // block every request and make those flows untestable. NEXT_PUBLIC_E2E=1 is
  // set ONLY by the playwright webServer config and never in real envs.
  if (process.env.NEXT_PUBLIC_E2E === '1') {
    const p = POLICIES[name]
    return { ok: true, limit: p.limit, remaining: p.limit, reset: 0, unavailable: true }
  }
  try {
    const l = getLimiter(name)
    const r = await l.limit(key)
    return {
      ok: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: r.reset,
      unavailable: false,
    }
  } catch {
    const p = POLICIES[name]
    return {
      ok: p.failMode === 'open',
      limit: p.limit,
      remaining: 0,
      reset: Date.now() + 60_000,
      unavailable: true,
    }
  }
}

export function rateLimit429(outcome: RateLimitOutcome): Response {
  const retryAfter = Math.max(1, Math.ceil((outcome.reset - Date.now()) / 1000))
  return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
      'X-RateLimit-Limit': String(outcome.limit),
      'X-RateLimit-Remaining': String(outcome.remaining),
    },
  })
}
