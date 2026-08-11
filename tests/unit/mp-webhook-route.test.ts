import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyWebhookSignature } from '@/modules/payments/webhook-auth'
import { createHmac } from 'node:crypto'

// Mock the mock-mp module so we can control MP_MOCK_ENABLED
vi.mock('@/modules/payments/mock-mp', () => ({
  MP_MOCK_ENABLED: false,
}))

describe('verifyWebhookSignature', () => {
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
    expect(verifyWebhookSignature(null, null, null)).toBe(true)
  })

  it('returns false when secret env unset in production (fail closed)', () => {
    env['NODE_ENV'] = 'production'
    expect(verifyWebhookSignature(null, null, null)).toBe(false)
    env['NODE_ENV'] = 'test'
  })

  it('returns false when secret env set but headers missing', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    expect(verifyWebhookSignature(null, 'req-id', 'data-id')).toBe(false)
    expect(verifyWebhookSignature('ts=1,v1=a', null, 'data-id')).toBe(false)
    expect(verifyWebhookSignature('ts=1,v1=a', 'req-id', null)).toBe(false)
  })

  it('returns false when signature format is invalid', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    expect(verifyWebhookSignature('invalid-format', 'req-id', 'data-id')).toBe(false)
  })

  it('returns true when HMAC signature is correct', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    const ts = '1620000000'
    const requestId = 'req-123'
    const dataId = 'data-456'

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const expectedHash = createHmac('sha256', 'super-secret').update(manifest).digest('hex')

    const xSignature = `ts=${ts},v1=${expectedHash}`
    expect(verifyWebhookSignature(xSignature, requestId, dataId)).toBe(true)
  })

  it('returns false when HMAC signature is incorrect', () => {
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    const xSignature = `ts=1620000000,v1=wrong-hash`
    expect(verifyWebhookSignature(xSignature, 'req-id', 'data-id')).toBe(false)
  })

  it('lowercases alphanumeric data.id before building the manifest (MP spec)', () => {
    // MP delivers subscription/preapproval data.id in uppercase but signs the
    // manifest with the lowercased value. Passing the uppercase id must verify.
    process.env.MP_WEBHOOK_SECRET = 'super-secret'
    const ts = '1620000000'
    const requestId = 'req-123'
    const upperDataId = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3'

    const manifest = `id:${upperDataId.toLowerCase()};request-id:${requestId};ts:${ts};`
    const expectedHash = createHmac('sha256', 'super-secret').update(manifest).digest('hex')

    const xSignature = `ts=${ts},v1=${expectedHash}`
    expect(verifyWebhookSignature(xSignature, requestId, upperDataId)).toBe(true)
  })
})
