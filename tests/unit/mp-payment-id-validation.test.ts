import { describe, expect, it } from 'vitest'
import { webhookPayloadSchema } from '@/modules/payments/payment.schema'

const NUMERIC = '999000111'
const HARMFUL = ['../../etc/passwd', 'https://evil.example/x', '1; DROP TABLE', '1 OR 1=1', 'abc', '']

describe('webhookPayloadSchema: mpPaymentId must be strictly numeric', () => {
  it('accepts a numeric id', () => {
    const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: 'payment', data: { id: NUMERIC } })
    expect(r.success).toBe(true)
  })
  for (const bad of HARMFUL) {
    it(`rejects "${bad}"`, () => {
      const r = webhookPayloadSchema.safeParse({ id: 'evt-1', type: 'payment', data: { id: bad } })
      expect(r.success).toBe(false)
    })
  }
})
