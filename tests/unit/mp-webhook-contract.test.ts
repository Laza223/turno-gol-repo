import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  paymentStatusResponseSchema,
  webhookPayloadSchema,
  webhookResponseSchema,
} from '@/modules/payments/payment.schema'

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

  it('coerces a numeric event id AND a numeric data.id to strings', () => {
    // MP sends `id`/`data.id` as either a number or a string; the handler relies
    // on them being strings (idempotency key + mp payment id lookup). A regression
    // dropping either coercion would compare a number against a text PK and either
    // crash or silently never match → duplicate processing / lost confirmation.
    const parsed = webhookPayloadSchema.parse({
      ...MP_PAYMENT_WEBHOOK,
      id: 12345678901,
      data: { id: 111122223333 },
    })
    expect(parsed.id).toBe('12345678901')
    expect(typeof parsed.id).toBe('string')
    expect(parsed.data.id).toBe('111122223333')
    expect(typeof parsed.data.id).toBe('string')
  })

  it('tolerates unknown extra fields (MP may add fields without breaking us)', () => {
    const parsed = webhookPayloadSchema.parse({
      ...MP_PAYMENT_WEBHOOK,
      some_future_field: 'whatever',
      data: { id: '111122223333', extra: true },
    })
    expect(parsed.data.id).toBe('111122223333')
    expect(parsed).not.toHaveProperty('some_future_field')
    // Unknown keys inside `data` are stripped too, not passed through.
    expect(parsed.data).not.toHaveProperty('extra')
  })

  it('rejects a payload missing data.id', () => {
    expect(webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: {} }).success).toBe(false)
  })

  it('rejects a payload missing the top-level event id (idempotency key)', () => {
    // `id` is the mpEventId → the processed_webhooks idempotency key. If the schema
    // ever makes it optional, the handler would dedupe on `undefined` and reprocess
    // every retry. There must be no way to parse a payload without it.
    const noId: Record<string, unknown> = { ...MP_PAYMENT_WEBHOOK }
    delete noId.id
    expect(webhookPayloadSchema.safeParse(noId).success).toBe(false)
  })

  it('requires the `type` the handler routes on', () => {
    const noType: Record<string, unknown> = { ...MP_PAYMENT_WEBHOOK }
    delete noType.type
    expect(webhookPayloadSchema.safeParse(noType).success).toBe(false)
  })

  it('rejects a non-numeric mp payment id outside mock mode', () => {
    vi.stubEnv('MP_MOCK_MODE', '0')
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: 'pref_abc123' } })
        .success,
    ).toBe(false)
  })

  it('rejects an empty data.id', () => {
    vi.stubEnv('MP_MOCK_MODE', '0')
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: '' } }).success,
    ).toBe(false)
  })

  it('accepts a 32-digit mp payment id but rejects a 33-digit one (regex bound)', () => {
    vi.stubEnv('MP_MOCK_MODE', '0')
    const id32 = '1'.repeat(32)
    const id33 = '1'.repeat(33)
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: id32 } }).success,
    ).toBe(true)
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: id33 } }).success,
    ).toBe(false)
  })

  it('accepts mock payment ids ONLY when MP_MOCK_MODE=1 (and not production)', () => {
    const mockId = 'MOCK-APPROVED-123e4567-e89b-12d3-a456-426614174000'

    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MP_MOCK_MODE', '0')
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: mockId } }).success,
    ).toBe(false)

    vi.stubEnv('MP_MOCK_MODE', '1')
    const parsed = webhookPayloadSchema.parse({ ...MP_PAYMENT_WEBHOOK, data: { id: mockId } })
    expect(parsed.data.id).toBe(mockId)
  })

  it('rejects mock payment ids in production even if MP_MOCK_MODE=1 leaks (prod hard-gate)', () => {
    // mock-mp.ts gates the env-mock gateway behind NODE_ENV !== 'production'. The
    // schema must honour the SAME invariant: a leaked MP_MOCK_MODE=1 in a prod
    // deploy must not make the payload schema start accepting forged MOCK-* ids.
    const mockId = 'MOCK-APPROVED-123e4567-e89b-12d3-a456-426614174000'
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MP_MOCK_MODE', '1')
    expect(
      webhookPayloadSchema.safeParse({ ...MP_PAYMENT_WEBHOOK, data: { id: mockId } }).success,
    ).toBe(false)
  })

  it('rejects a mock id whose outcome is not APPROVED/REJECTED even in mock mode', () => {
    // Only the two outcomes the mock gateway can decode are valid; anything else
    // (e.g. MOCK-PENDING-*) must not slip through.
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MP_MOCK_MODE', '1')
    expect(
      webhookPayloadSchema.safeParse({
        ...MP_PAYMENT_WEBHOOK,
        data: { id: 'MOCK-PENDING-123e4567-e89b-12d3-a456-426614174000' },
      }).success,
    ).toBe(false)
  })
})

// ── Output (response) contracts — doc15 §2 ────────────────────────────────────
// validatedJson() validates the route's ACK body against these z.strictObject() schemas
// at runtime. If the shape drifts, the route throws 500 in prod silently. These
// tests pin the ACK contract MP and the player polling screen depend on.
describe('MercadoPago webhook ACK contract (webhookResponseSchema)', () => {
  it('accepts the bare ok ACK and the ignored-event ACK', () => {
    expect(webhookResponseSchema.parse({ ok: true })).toEqual({ ok: true })
    expect(webhookResponseSchema.parse({ ok: true, ignored: 'subscription_preapproval' })).toEqual({
      ok: true,
      ignored: 'subscription_preapproval',
    })
  })

  it('rejects ok:false and any extra field (strict ACK)', () => {
    expect(webhookResponseSchema.safeParse({ ok: false }).success).toBe(false)
    expect(webhookResponseSchema.safeParse({ ok: true, unexpected: 1 }).success).toBe(false)
    // `ignored` must be a string when present.
    expect(webhookResponseSchema.safeParse({ ok: true, ignored: 123 }).success).toBe(false)
  })
})

describe('payment status polling contract (paymentStatusResponseSchema)', () => {
  it('accepts the full polling payload with valid enums', () => {
    const ok = paymentStatusResponseSchema.safeParse({
      data: {
        status: 'confirmed',
        depositStatus: 'paid',
        expiresAt: '2027-06-01T10:00:00.000Z',
      },
    })
    expect(ok.success).toBe(true)
  })

  it('rejects a booking status outside the state-machine enum', () => {
    // If a new booking status is added to the state machine but not mirrored here,
    // the player polling endpoint 500s. This pins the enum so that drift fails a test.
    expect(
      paymentStatusResponseSchema.safeParse({
        data: { status: 'cancelled_refunded', depositStatus: 'paid', expiresAt: 'x' },
      }).success,
    ).toBe(false)
    expect(
      paymentStatusResponseSchema.safeParse({
        data: { status: 'confirmed', depositStatus: 'captured_typo', expiresAt: 'x' },
      }).success,
    ).toBe(false)
  })

  it('rejects extra fields (strict polling contract)', () => {
    expect(
      paymentStatusResponseSchema.safeParse({
        data: {
          status: 'confirmed',
          depositStatus: 'paid',
          expiresAt: 'x',
          leak: 'mp_access_token',
        },
      }).success,
    ).toBe(false)
  })
})
