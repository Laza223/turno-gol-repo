import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as webhookRoute } from '@/app/api/webhooks/mercadopago/route'

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn() })),
}))
process.env.MP_WEBHOOK_SECRET = 'a'.repeat(32)

function mk(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/mercadopago?tenant=11111111-1111-1111-1111-111111111111', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': 'a'.repeat(32),
    },
    body: JSON.stringify(body),
  })
}

describe('webhook route rejects non-numeric mpPaymentId', () => {
  for (const bad of ['../etc/passwd', 'https://evil', '1 OR 1=1', '']) {
    it(`rejects data.id="${bad}"`, async () => {
      const res = await webhookRoute(mk({ id: 'evt-1', type: 'payment', data: { id: bad } }))
      expect(res.status).toBe(400)
    })
  }
  it('accepts a numeric id', async () => {
    const res = await webhookRoute(mk({ id: 'evt-1', type: 'payment', data: { id: '12345' } }))
    expect(res.status).toBe(200)
  })
})
