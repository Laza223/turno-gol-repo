import { describe, expect, it } from 'vitest'
import { validateServerEnv } from '@/shared/env'

describe('validateServerEnv', () => {
  const baseValid = {
    DATABASE_URL: 'postgres://x',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
    SUPABASE_SERVICE_ROLE_KEY: 'a'.repeat(40),
    IMPERSONATION_COOKIE_SECRET: 'a'.repeat(32),
    ENCRYPTION_KEY: 'a'.repeat(64),
    MP_CLIENT_ID: 'mp-id',
    MP_CLIENT_SECRET: 'mp-secret',
    MP_WEBHOOK_SECRET: 'a'.repeat(32),
    RESEND_API_KEY: 're_xxx',
    UPSTASH_REDIS_REST_URL: 'https://stub',
    UPSTASH_REDIS_REST_TOKEN: 'a'.repeat(32),
    VAPID_PUBLIC_KEY: 'a'.repeat(80),
    VAPID_PRIVATE_KEY: 'a'.repeat(40),
    VAPID_SUBJECT: 'mailto:contact@turnogol.app',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'a'.repeat(80),
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET: 'test-bucket',
    R2_PUBLIC_BASE_URL: 'https://media.example.com',
  }

  it('passes with all required vars', () => {
    expect(() => validateServerEnv({ ...baseValid, NODE_ENV: 'production' })).not.toThrow()
  })

  // ENCRYPTION_KEY: 64 hex EXACTOS. El esquema pedía `min(32)`, así que una
  // clave con el formato equivocado lo pasaba entero y recién moría en runtime,
  // dentro del callback de OAuth de MercadoPago. Caso real en prod 2026-07-31.
  it.each([
    ['32 chars (el largo que el esquema viejo aceptaba)', 'a'.repeat(32)],
    ['65 hex (uno de más)', 'a'.repeat(65)],
    ['64 chars con un no-hex adentro', 'z' + 'a'.repeat(63)],
  ])('rechaza ENCRYPTION_KEY de %s', (_caso, key) => {
    expect(() => validateServerEnv({ ...baseValid, ENCRYPTION_KEY: key })).toThrow(/ENCRYPTION_KEY/)
  })

  it('acepta ENCRYPTION_KEY de 64 hex, en mayúsculas o minúsculas', () => {
    for (const key of ['a1b2c3d4e5f6'.repeat(5) + 'a1b2', 'A1B2C3D4E5F6'.repeat(5) + 'A1B2']) {
      expect(key).toHaveLength(64)
      expect(() => validateServerEnv({ ...baseValid, ENCRYPTION_KEY: key })).not.toThrow()
    }
  })

  it('fails when IMPERSONATION_COOKIE_SECRET < 16', () => {
    expect(() => validateServerEnv({ ...baseValid, IMPERSONATION_COOKIE_SECRET: 'short' })).toThrow(
      /IMPERSONATION_COOKIE_SECRET/,
    )
  })

  it('fails when MP_WEBHOOK_SECRET missing in production', () => {
    const { MP_WEBHOOK_SECRET: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'production' })).toThrow(
      /MP_WEBHOOK_SECRET/,
    )
  })

  it('allows missing MP_WEBHOOK_SECRET outside production', () => {
    const { MP_WEBHOOK_SECRET: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'development' })).not.toThrow()
  })

  it('fails when NEXT_PUBLIC_APP_URL missing in production', () => {
    const { NEXT_PUBLIC_APP_URL: _, ...rest } = baseValid
    expect(() => validateServerEnv({ ...rest, NODE_ENV: 'production' })).toThrow(
      /NEXT_PUBLIC_APP_URL/,
    )
  })
})
