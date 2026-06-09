import { describe, expect, it } from 'vitest'
import { validateServerEnv } from '@/shared/env'

describe('validateServerEnv', () => {
  const baseValid = {
    DATABASE_URL: 'postgres://x',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
    SUPABASE_SERVICE_ROLE_KEY: 'a'.repeat(40),
    PIN_COOKIE_SECRET: 'a'.repeat(32),
    ENCRYPTION_KEY: 'a'.repeat(32),
    MP_CLIENT_ID: 'mp-id',
    MP_CLIENT_SECRET: 'mp-secret',
    MP_WEBHOOK_SECRET: 'a'.repeat(32),
    RESEND_API_KEY: 're_xxx',
    UPSTASH_REDIS_REST_URL: 'https://stub',
    UPSTASH_REDIS_REST_TOKEN: 'a'.repeat(32),
  }

  it('passes with all required vars', () => {
    expect(() => validateServerEnv({ ...baseValid, NODE_ENV: 'production' })).not.toThrow()
  })

  it('fails when PIN_COOKIE_SECRET < 16', () => {
    expect(() => validateServerEnv({ ...baseValid, PIN_COOKIE_SECRET: 'short' })).toThrow(/PIN_COOKIE_SECRET/)
  })

  it('fails when MP_WEBHOOK_SECRET missing in production', () => {
    const { MP_WEBHOOK_SECRET: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'production' })).toThrow(/MP_WEBHOOK_SECRET/)
  })

  it('allows missing MP_WEBHOOK_SECRET outside production', () => {
    const { MP_WEBHOOK_SECRET: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'development' })).not.toThrow()
  })

  it('fails when NEXT_PUBLIC_APP_URL missing in production', () => {
    const { NEXT_PUBLIC_APP_URL: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'production' })).toThrow(/NEXT_PUBLIC_APP_URL/)
  })
})
