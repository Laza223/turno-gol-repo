import { afterEach, describe, expect, it, vi } from 'vitest'
import { webhookPayloadSchema } from '@/modules/payments/payment.schema'

// Contract test for the MercadoPago IPN/webhook v2 payload consumed by
// src/app/api/webhooks/mercadopago/route.ts.
//
// The fixture below is a SNAPSHOT of the external contract — the shape MP sends.
// `webhookPayloadSchema` is the exact schema the route handler parses with, so
// these tests fail loudly if either side drifts:
//   - if we tighten/break the schema, the canonical payload stops parsing;
//   - if MP changes its payload, update the fixture together with the schema —
//     the diff forces a human to review the change instead of silently 400-ing
//     every webhook in production.

const MP_PAYMENT_WEBHOOK = {
  id: 12345678901,
  live_mode: true,
  type: 'payment',
  date_created: '2024-02-01T10:00:00.000-03:00',
  user_id: 987654321,
  api_version: 'v1',
  action: 'payment.created',
  data: { id: '111122223333' },
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('MercadoPago webhook payload contract', () => {
  it('accepts the canonical payment webhook and pins the parsed shape', () => {
    const parsed = webhookPayloadSchema.parse(MP_PAYMENT_WEBHOOK)
    expect(parsed).toEqual({
      id: '12345678901',
      type: 'payment',
      action: 'payment.created',
      data: { id: '111122223333' },
      date_created: '2024-02-01T10:00:00.000-03:00',
      user_id: 987654321,
      api_version: 'v1',
      live_mode: true,
    })
  })

  it('coerces the numeric event id and data.id to strings', () => {
    // MP sends `id`/`data.id` as either a number or a string; the handler relies
    // on them being strings (idempotency key + mp payment id lookup).
    const parsed = webhookPayloadSchema.parse({
      ...MP_PAYMENT_WEBHOOK,
      id: '12345678901',
      data: { id: 111122223333 },
    })
    expect(parsed.id).toBe('12345678901')
    expect(parsed.data.id).toBe('111122223333')
  })

  it('tolerates unknown extra fields (MP may add fields without breaking us)', () => {
    const parsed = webhookPayloadSchema.parse({
      ...MP_PAYMENT_WEBHOOK,
      some_future_field: 'whatever',
      data: { id: '111122223333', extra: true },
    })
    expect(parsed.data.id).toBe('111122223333')
    expect(parsed).not.toHaveProperty('some_future_field')
  })

  it('rejects a payload missing data.id', () => {
    expect(webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: {} }).success).toBe(false)
  })

  it('requires the `type` the handler routes on', () => {
    const noType: Record<string, unknown> = { ...MP_PAYMENT_WEBHOOK }
    delete noType.type
    expect(webhookPayloadSchema.safeParse(noType).success).toBe(false)
  })

  it('rejects a non-numeric mp payment id outside mock mode', () => {
    vi.stubEnv('MP_MOCK_MODE', '0')
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: 'pref_abc123' } }).success,
    ).toBe(false)
  })

  it('accepts mock payment ids ONLY when MP_MOCK_MODE=1', () => {
    const mockId = 'MOCK-APPROVED-123e4567-e89b-12d3-a456-426614174000'

    vi.stubEnv('MP_MOCK_MODE', '0')
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: mockId } }).success,
    ).toBe(false)

    vi.stubEnv('MP_MOCK_MODE', '1')
    const parsed = webhookPayloadSchema.parse({ ...MP_PAYMENT_WEBHOOK, data: { id: mockId } })
    expect(parsed.data.id).toBe(mockId)
  })
})
