/**
 * Un webhook rechazado tiene que dejar rastro de POR QUÉ.
 *
 * Los tres rechazos del route (`invalid payload`, `invalid signature`,
 * `missing tenant`) se veían iguales en los logs de Vercel: una línea
 * `POST /api/webhooks/mercadopago 400` sin causa. Diagnosticar el cobro de
 * suscripciones costó reproducir el payload a mano contra producción dos veces
 * seguidas (#176 y #177), así que el rechazo mudo es en sí mismo el bug.
 *
 * Lo que se loguea es FORMA, no contenido: tipo de evento y formato del id.
 * Nunca el payload entero, y nada que identifique a una persona.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const SECRET = 'secreto-de-prueba'
const warn = vi.fn()

vi.mock('@/modules/payments/mock-mp', () => ({
  MP_MOCK_ENABLED: false,
  // Lo usa `webhookPayloadSchema` para el doble candado de los ids MOCK-*.
  computeMpMockEnabled: () => false,
}))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({ resolveSubscriptionTenant: vi.fn() }),
}))
vi.mock('@/shared/jobs/boss', () => ({ getBoss: async () => ({ send: vi.fn() }) }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const URL_WEBHOOK = 'https://turnogol.app/api/webhooks/mercadopago'

function firmar(dataId: string): Record<string, string> {
  const ts = '1700000000'
  const v1 = createHmac('sha256', SECRET)
    .update(`id:${dataId.toLowerCase()};request-id:req-1;ts:${ts};`)
    .digest('hex')
  return {
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': 'req-1',
    'content-type': 'application/json',
  }
}

async function postear(
  payload: unknown,
  headers: Record<string, string>,
  url = URL_WEBHOOK,
): Promise<Response> {
  const { POST } = await import('@/app/api/webhooks/mercadopago/route')
  const { NextRequest } = await import('next/server')
  return POST(new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(payload) }))
}

/** El último `logger.warn`, ya desarmado en su objeto de contexto. */
function ultimoWarn(): Record<string, unknown> {
  expect(warn).toHaveBeenCalled()
  const call = warn.mock.calls.at(-1)
  return (call?.[1] ?? {}) as Record<string, unknown>
}

describe('webhook de MercadoPago — todo rechazo queda explicado en el log', () => {
  const env = process.env as Record<string, string | undefined>

  beforeEach(() => {
    vi.resetModules()
    warn.mockReset()
    env['MP_WEBHOOK_SECRET'] = SECRET
  })

  it('un payload que no pasa el schema dice qué tipo era y qué forma tenía el id', async () => {
    const res = await postear(
      // Un `payment` con hash: exactamente el caso que el #177 dejó rechazado a
      // propósito. Sin el log, este 400 es indistinguible de los otros dos.
      { id: 1, type: 'payment', data: { id: '5c6294a93fe04f309344f654479e633b' } },
      { 'content-type': 'application/json' },
    )

    expect(res.status).toBe(400)
    expect(ultimoWarn()).toMatchObject({
      motivo: 'invalid payload',
      status: 400,
      eventType: 'payment',
      formaDataId: 'hex(32)',
    })
  })

  it('una firma inválida se distingue de un payload inválido', async () => {
    const res = await postear(
      { id: 1, type: 'subscription_preapproval', data: { id: '123456' } },
      {
        'x-signature': 'ts=1,v1=firma-falsa',
        'x-request-id': 'req-1',
        'content-type': 'application/json',
      },
    )

    expect(res.status).toBe(401)
    expect(ultimoWarn()).toMatchObject({
      motivo: 'invalid signature',
      eventType: 'subscription_preapproval',
      formaDataId: 'numerico(6)',
    })
  })

  it('un `payment` sin complejo en la URL se registra como tal', async () => {
    const res = await postear(
      { id: 1, type: 'payment', data: { id: '123456789' } },
      firmar('123456789'),
    )

    expect(res.status).toBe(400)
    expect(ultimoWarn()).toMatchObject({ motivo: 'missing tenant', eventType: 'payment' })
  })

  it('no filtra el payload ni el id completo, solo su forma', async () => {
    const ID = '5c6294a93fe04f309344f654479e633b'
    await postear(
      { id: 1, type: 'payment', data: { id: ID } },
      { 'content-type': 'application/json' },
    )

    const contexto = JSON.stringify(ultimoWarn())
    expect(contexto).not.toContain(ID)
    expect(contexto).toContain('hex(32)')
  })

  it('un JSON ilegible no explota al intentar describirlo', async () => {
    const { POST } = await import('@/app/api/webhooks/mercadopago/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(
      new NextRequest(URL_WEBHOOK, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'no soy json',
      }),
    )

    expect(res.status).toBe(400)
    expect(ultimoWarn()).toMatchObject({ motivo: 'invalid json' })
  })
})
