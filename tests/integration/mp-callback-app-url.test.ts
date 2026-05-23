import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as mpCallback } from '@/app/api/mp/callback/route'

const env = process.env as Record<string, string | undefined>
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL
  saved.NODE_ENV = env.NODE_ENV
})
afterEach(() => {
  env.NEXT_PUBLIC_APP_URL = saved.NEXT_PUBLIC_APP_URL
  env.NODE_ENV = saved.NODE_ENV
})

describe('mp/callback: APP_URL required in production', () => {
  it('redirects with an error when APP_URL missing in production', async () => {
    env.NODE_ENV = 'production'
    delete env.NEXT_PUBLIC_APP_URL

    const req = new NextRequest('http://attacker.example/api/mp/callback?code=c&state=s.x')
    const res = await mpCallback(req)
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toMatch(/mp_config_missing|mp_invalid_state/)
  })
})
