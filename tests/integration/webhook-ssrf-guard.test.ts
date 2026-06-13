import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as webhookRoute } from '@/app/api/webhooks/mercadopago/route'

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: vi.fn() })),
}))
const SECRET = 'a'.repeat(32)
process.env.MP_WEBHOOK_SECRET = SECRET

// BK-02: la ruta exige firma HMAC SHA-256 (x-signature ts/v1 + x-request-id).
// Firmamos cada request para que el guard de SSRF se pruebe DESPUÉS de la
// autenticación: un data.id malicioso debe rebotar (400) aun con firma válida.
function mk(body: { data: { id: string } } & Record<string, unknown>): NextRequest {
  const ts = '1718000000'
  const requestId = 'req-ssrf-test'
  const manifest = `id:${body.data.id.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  return new NextRequest('http://localhost/api/webhooks/mercadopago?tenant=11111111-1111-1111-1111-111111111111', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${v1}`,
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
