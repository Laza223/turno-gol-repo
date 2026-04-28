import { describe, expect, it } from 'vitest'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'

describe('MockGateway', () => {
  it('createPreference returns initPoint + preferenceId', async () => {
    const gw = new MockGateway()
    const res = await gw.createPreference({
      bookingId: '00000000-0000-0000-0000-000000000001',
      amount: 100_000,
      description: 'Test',
      successUrl: 'https://app/success',
      failureUrl: 'https://app/failure',
      pendingUrl: 'https://app/pending',
      notificationUrl: 'https://app/api/mp/webhooks?tenant=x',
      expiresAt: new Date(),
    })
    expect(res.preferenceId).toMatch(/^mp-pref-/)
    expect(res.initPoint).toMatch(/^https:\/\/mp\.test\/checkout\//)
    expect(res.sandboxInitPoint).toMatch(/^https:\/\/mp\.test\/sandbox\/checkout\//)
    expect(gw.preferenceCalls).toHaveLength(1)
  })

  it('getPaymentStatus returns configured override per id', async () => {
    const gw = new MockGateway()
    gw.statusByPaymentId['mp-1'] = {
      mpPaymentId: 'mp-1',
      status: 'approved',
      amount: 240_000,
      externalReference: 'booking-x',
      paymentMethodId: 'visa',
    }
    const res = await gw.getPaymentStatus('mp-1')
    expect(res.status).toBe('approved')
    expect(res.amount).toBe(240_000)
    expect(res.externalReference).toBe('booking-x')
    expect(gw.statusCalls).toEqual(['mp-1'])
  })

  it('createRefund records call and returns refund id', async () => {
    const gw = new MockGateway()
    const res = await gw.createRefund('mp-payment-1', 50_000)
    expect(res.mpRefundId).toContain('mp-payment-1')
    expect(res.status).toBe('approved')
    expect(gw.refundCalls).toEqual([{ mpPaymentId: 'mp-payment-1', amount: 50_000 }])
  })
})
