import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { POLICIES, type PolicyName } from './policies'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing')
  }
  _redis = new Redis({ url, token })
  return _redis
}

const limiters = new Map<PolicyName, Ratelimit>()

export function getLimiter(name: PolicyName): Ratelimit {
  let l = limiters.get(name)
  if (!l) {
    const p = POLICIES[name]
    l = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.tokenBucket(p.limit, p.window, p.limit),
      prefix: `rl:${name}`,
      analytics: false,
    })
    limiters.set(name, l)
  }
  return l
}

export function __resetLimitersForTests(): void {
  limiters.clear()
  _redis = null
}
