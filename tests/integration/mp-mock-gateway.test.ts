/**
 * Pure unit-style tests for LocalMockGateway and its helpers.
 * No DB required — lives in tests/integration/ per the F07 audit plan.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import {
  buildMockPaymentId,
  parseMockPaymentId,
  LocalMockGateway,
} from '@/modules/payments/mock-mp'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('buildMockPaymentId / parseMockPaymentId round-trip', () => {
  it('approved round-trip', () => {
    const id = buildMockPaymentId('approved', UUID)
    const parsed = parseMockPaymentId(id)
    expect(parsed).toEqual({ outcome: 'approved', bookingId: UUID })
  })

  it('rejected round-trip', () => {
    const id = buildMockPaymentId('rejected', UUID)
    const parsed = parseMockPaymentId(id)
    expect(parsed).toEqual({ outcome: 'rejected', bookingId: UUID })
  })

  it('garbage returns null', () => {
    expect(parseMockPaymentId('garbage')).toBeNull()
    expect(parseMockPaymentId('MOCK-APPROVED-not-a-uuid')).toBeNull()
    expect(parseMockPaymentId('')).toBeNull()
  })
})

describe('LocalMockGateway.getPaymentStatus', () => {
  it('approved payment id → status approved + correct externalReference', async () => {
    const gw = new LocalMockGateway()
    const id = buildMockPaymentId('approved', UUID)
    const info = await gw.getPaymentStatus(id)
    expect(info.status).toBe('approved')
    expect(info.externalReference).toBe(UUID)
    expect(info.mpPaymentId).toBe(id)
  })

  it('rejected payment id → status rejected', async () => {
    const gw = new LocalMockGateway()
    const id = buildMockPaymentId('rejected', UUID)
    const info = await gw.getPaymentStatus(id)
    expect(info.status).toBe('rejected')
    expect(info.externalReference).toBe(UUID)
  })

  it('unknown id → status pending, empty externalReference', async () => {
    const gw = new LocalMockGateway()
    const info = await gw.getPaymentStatus('unknown-id')
    expect(info.status).toBe('pending')
    expect(info.externalReference).toBe('')
  })
})

describe('LocalMockGateway.createPreference', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  afterAll(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  it('initPoint contains /mock-mp/checkout?booking=<uuid>', async () => {
    const gw = new LocalMockGateway()
    const result = await gw.createPreference({
      bookingId: UUID,
      amount: 5000,
      description: 'x',
      successUrl: '',
      failureUrl: '',
      pendingUrl: '',
      notificationUrl: '',
      expiresAt: new Date(),
    })
    expect(result.initPoint).toContain(`/mock-mp/checkout?booking=${UUID}`)
    expect(result.preferenceId).toBe(`mock-pref-${UUID}`)
    expect(result.sandboxInitPoint).toBe(result.initPoint)
  })
})
