/**
 * El webhook resuelve el complejo cuando MercadoPago no puede mandarlo en la URL.
 *
 * Contexto (verificado en producción el 2026-08-20): **MP no guarda
 * `notification_url` en un preapproval**. El `PUT` devuelve 200 y el campo
 * queda vacío, así que las notificaciones de suscripción llegan por el canal
 * global del panel — una URL fija, sin el `?tenant=` que TurnoGol sí puede
 * poner por operación en las preferencias de seña.
 *
 * Antes eso era un 400 y el cobro recurrente del SaaS no llegaba NUNCA: el
 * complejo pagaba, MP le cobraba todos los meses, y la suscripción se quedaba
 * en `trialing`. Los tests de abajo cubren el camino nuevo y, sobre todo, que
 * el viejo no se haya aflojado: un `payment` sin tenant sigue siendo 400, y una
 * firma inválida sigue cortando ANTES de gastar una llamada a MP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const SECRET = 'secreto-de-prueba'
const TENANT = '11111111-2222-3333-4444-555555555555'

const resolveSubscriptionTenant = vi.fn()
const send = vi.fn()

vi.mock('@/modules/payments/mock-mp', () => ({ MP_MOCK_ENABLED: false }))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({ resolveSubscriptionTenant }),
}))
vi.mock('@/shared/jobs/boss', () => ({ getBoss: async () => ({ send }) }))

function firmar(dataId: string): Record<string, string> {
  const ts = '1700000000'
  const manifest = `id:${dataId.toLowerCase()};request-id:req-1;ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  return {
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': 'req-1',
    'content-type': 'application/json',
  }
}

async function postear(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  const { POST } = await import('@/app/api/webhooks/mercadopago/route')
  const { NextRequest } = await import('next/server')
  return POST(new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(payload) }))
}

const evento = (type: string, dataId: string) => ({ id: 99, type, data: { id: dataId } })
const SIN_TENANT = 'https://turnogol.app/api/webhooks/mercadopago'

describe('webhook de MercadoPago — resolución del complejo', () => {
  const env = process.env as Record<string, string | undefined>
  const secretOriginal = env['MP_WEBHOOK_SECRET']

  beforeEach(() => {
    vi.resetModules()
    resolveSubscriptionTenant.mockReset()
    send.mockReset()
    env['MP_WEBHOOK_SECRET'] = SECRET
  })

  afterEach(() => {
    if (secretOriginal === undefined) delete env['MP_WEBHOOK_SECRET']
    else env['MP_WEBHOOK_SECRET'] = secretOriginal
  })

  it('resuelve el complejo desde MercadoPago cuando la URL no lo trae', async () => {
    resolveSubscriptionTenant.mockResolvedValue(TENANT)

    const res = await postear(
      SIN_TENANT,
      evento('subscription_authorized_payment', '777'),
      firmar('777'),
    )

    expect(res.status).toBe(200)
    expect(resolveSubscriptionTenant).toHaveBeenCalledWith('subscription_authorized_payment', '777')
    // Lo que importa: el job se encola CON el complejo que dijo MercadoPago.
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT }),
      expect.anything(),
    )
  })

  it('ignora con 200 —no reintenta— si MercadoPago no reconoce el evento', async () => {
    resolveSubscriptionTenant.mockResolvedValue(null)

    const res = await postear(SIN_TENANT, evento('subscription_preapproval', '404'), firmar('404'))

    // 200 a propósito: un preapproval sin `external_reference` (creado a mano en
    // el panel, por ejemplo) no se va a resolver nunca. Un 4xx/5xx haría que MP
    // lo reintente para siempre.
    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('devuelve 500 si la consulta a MercadoPago falla, para que reintente', async () => {
    resolveSubscriptionTenant.mockRejectedValue(new Error('MP 503'))

    const res = await postear(SIN_TENANT, evento('subscription_preapproval', '888'), firmar('888'))

    // Distinto del caso de arriba: acá NO sabemos de quién es el evento, así
    // que perderlo sería perder un cobro. 500 = MP reintenta.
    expect(res.status).toBe(500)
    expect(send).not.toHaveBeenCalled()
  })

  it('un pago de seña sin tenant sigue siendo 400', async () => {
    const res = await postear(SIN_TENANT, evento('payment', '555'), firmar('555'))

    // No se puede resolver: para preguntarle a MP hace falta el token del
    // complejo, y saber cuál es el complejo era justamente la pregunta.
    expect(res.status).toBe(400)
    expect(resolveSubscriptionTenant).not.toHaveBeenCalled()
  })

  it('la firma se valida ANTES de consultar a MercadoPago', async () => {
    const res = await postear(SIN_TENANT, evento('subscription_preapproval', '999'), {
      'x-signature': 'ts=1,v1=firma-falsa',
      'x-request-id': 'req-1',
      'content-type': 'application/json',
    })

    expect(res.status).toBe(401)
    // Sin esto, cualquiera con la URL podría hacernos gastar llamadas a MP.
    expect(resolveSubscriptionTenant).not.toHaveBeenCalled()
  })

  it('cuando la URL trae el tenant, no consulta a MercadoPago', async () => {
    const res = await postear(
      `${SIN_TENANT}?tenant=${TENANT}`,
      evento('subscription_preapproval', '111'),
      firmar('111'),
    )

    expect(res.status).toBe(200)
    expect(resolveSubscriptionTenant).not.toHaveBeenCalled()
  })
})
