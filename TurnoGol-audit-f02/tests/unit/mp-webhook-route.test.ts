import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyWebhookSecret } from '@/modules/payments/webhook-auth'

describe('verifyWebhookSecret', () => {
  const env = process.env as Record<string, string | undefined>
  const originalSecret = env['MP_WEBHOOK_SECRET']
  const originalNodeEnv = env['NODE_ENV']

  beforeEach(() => {
    delete env['MP_WEBHOOK_SECRET']
  })

  afterEach(() => {
    if (originalSecret === undefined) delete env['MP_WEBHOOK_SECRET']
    else env['MP_WEBHOOK_SECRET'] = originalSecret
    if (originalNodeEnv) env['NODE_ENV'] = originalNodeEnv
  })

  it('returns true when secret env unset and not production (dev/test)', () => {
    env['NODE_ENV'] = 'test'
    expect(verifyWebhookSecret(null)).toBe(true)
    expect(verifyWebhookSecret('anything')).toBe(true)
  })

  it('returns false when secret env unset in production (fail closed)', () => {
    env['NODE_ENV'] = 'production'
    expect(verifyWebhookSecret(null)).toBe(false)
    expect(verifyWebhookSecret('anything')).toBe(false)
    env['NODE_ENV'] = 'test'
  })

  it('returns false when secret env set but header missing', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    expect(verifyWebhookSecret(null)).toBe(false)
  })

  it('returns false when header does not match', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    expect(verifyWebhookSecret('wrong-secret')).toBe(false)
  })

  it('returns false when header has different length (no timing leak)', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    expect(verifyWebhookSecret('s')).toBe(false)
    expect(verifyWebhookSecret('super-secret-extra')).toBe(false)
  })

  it('returns true when header equals secret (timing-safe)', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    expect(verifyWebhookSecret('super-secret')).toBe(true)
  })
})
