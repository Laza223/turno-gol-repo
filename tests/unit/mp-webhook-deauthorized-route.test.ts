/**
 * `application.deauthorized`: el complejo revocó, DESDE EL PANEL DE MERCADOPAGO,
 * el permiso que le había dado a TurnoGol para cobrar en su cuenta.
 *
 * Antes de esto el aviso moría en `missing tenant` (400) — visto en el historial
 * real de la aplicación de Suscripciones: `400 - Fallida ·
 * application.deauthorized · 381048203 · 22/08 13:44 UTC`. TurnoGol seguía
 * creyendo que el token estaba vivo, el portal seguía exigiendo seña, y el
 * primero en enterarse de la desconexión era el JUGADOR, al intentar pagar.
 *
 * Lo que fija este archivo, además del camino feliz: que el vínculo lo decida
 * el `mp_user_id` firmado dentro del payload y NUNCA el `?tenant=` de la query
 * —esto termina en un UPDATE destructivo sobre credenciales de cobro— y que la
 * firma siga cortando antes de tocar la base.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const SECRET = 'secreto-de-prueba'
const TENANT = '11111111-2222-3333-4444-555555555555'
const OTRO_TENANT = '99999999-8888-7777-6666-555555555555'
const MP_USER_ID = '381048203'

const findTenantIdByMpUserId = vi.fn()
const send = vi.fn()

vi.mock('@/modules/payments/mock-mp', () => ({ MP_MOCK_ENABLED: false }))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({ resolveSubscriptionTenant: vi.fn() }),
}))
vi.mock('@/shared/jobs/boss', () => ({ getBoss: async () => ({ send }) }))
vi.mock('@/modules/tenants/tenant.service', () => ({ findTenantIdByMpUserId }))

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

const SIN_TENANT = 'https://turnogol.app/api/webhooks/mercadopago'

/** El aviso tal como llega por el canal global: sin `?tenant=`. */
const desvinculacion = (extra: Record<string, unknown> = {}) => ({
  id: 4242,
  type: 'application.deauthorized',
  data: { id: MP_USER_ID },
  user_id: MP_USER_ID,
  ...extra,
})

describe('webhook de MercadoPago — desvinculación de la aplicación', () => {
  const env = process.env as Record<string, string | undefined>
  const secretOriginal = env['MP_WEBHOOK_SECRET']

  beforeEach(() => {
    vi.resetModules()
    findTenantIdByMpUserId.mockReset()
    send.mockReset()
    env['MP_WEBHOOK_SECRET'] = SECRET
  })

  afterEach(() => {
    if (secretOriginal === undefined) delete env['MP_WEBHOOK_SECRET']
    else env['MP_WEBHOOK_SECRET'] = secretOriginal
  })

  it('resuelve el complejo por la cuenta de MercadoPago y encola el job', async () => {
    findTenantIdByMpUserId.mockResolvedValue(TENANT)

    const res = await postear(SIN_TENANT, desvinculacion(), firmar(MP_USER_ID))

    expect(res.status).toBe(200)
    expect(findTenantIdByMpUserId).toHaveBeenCalledWith(MP_USER_ID)
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT, eventType: 'application.deauthorized' }),
      expect.anything(),
    )
  })

  it('reconoce el evento cuando el nombre viaja en `action` y no en `type`', async () => {
    // MercadoPago no usa un solo criterio para nombrar sus eventos: en unos el
    // nombre fino va en `action`. El panel muestra una sola columna y no
    // distingue cuál de los dos campos lo traía.
    findTenantIdByMpUserId.mockResolvedValue(TENANT)

    const res = await postear(
      SIN_TENANT,
      desvinculacion({ type: 'application', action: 'application.deauthorized' }),
      firmar(MP_USER_ID),
    )

    expect(res.status).toBe(200)
    // El job se normaliza al literal canónico: `lockMpEvent` escribe este campo
    // en `processed_webhooks` y las dos codificaciones tienen que quedar
    // guardadas bajo el mismo nombre.
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT, eventType: 'application.deauthorized' }),
      expect.anything(),
    )
  })

  it('cae a `data.id` cuando `user_id` no corresponde a ningún complejo', async () => {
    findTenantIdByMpUserId.mockResolvedValueOnce(null).mockResolvedValueOnce(TENANT)

    const res = await postear(
      SIN_TENANT,
      desvinculacion({ user_id: '111', data: { id: MP_USER_ID } }),
      firmar(MP_USER_ID),
    )

    expect(res.status).toBe(200)
    expect(findTenantIdByMpUserId).toHaveBeenNthCalledWith(1, '111')
    expect(findTenantIdByMpUserId).toHaveBeenNthCalledWith(2, MP_USER_ID)
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT }),
      expect.anything(),
    )
  })

  it('IGNORA el `?tenant=` de la query: el vínculo lo decide MercadoPago', async () => {
    // El test que más importa. Esto termina desvinculando las credenciales de
    // cobro de un complejo: si la query pudiera elegir la víctima, cualquiera
    // con un aviso firmado dejaría a otro complejo sin cobrar.
    findTenantIdByMpUserId.mockResolvedValue(TENANT)

    const res = await postear(
      `${SIN_TENANT}?tenant=${OTRO_TENANT}`,
      desvinculacion(),
      firmar(MP_USER_ID),
    )

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT }),
      expect.anything(),
    )
    expect(send).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: OTRO_TENANT }),
      expect.anything(),
    )
  })

  it('ignora con 200 —sin encolar— si ninguna cuenta reclama ese id', async () => {
    // Ya se desvinculó por otro camino, o nunca fue de este sistema.
    // Reintentarlo no lo va a resolver nunca, así que no se pide reintento.
    findTenantIdByMpUserId.mockResolvedValue(null)

    const res = await postear(SIN_TENANT, desvinculacion(), firmar(MP_USER_ID))

    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('una firma inválida sigue cortando en 401, sin tocar la base', async () => {
    const res = await postear(SIN_TENANT, desvinculacion(), {
      'x-signature': 'ts=1700000000,v1=firmafalsa',
      'x-request-id': 'req-1',
      'content-type': 'application/json',
    })

    expect(res.status).toBe(401)
    expect(findTenantIdByMpUserId).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
