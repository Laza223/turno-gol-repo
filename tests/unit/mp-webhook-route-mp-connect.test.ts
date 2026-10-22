/**
 * El webhook de "Vinculación de aplicaciones" (`type: 'mp-connect'`).
 *
 * Cuando el dueño desautoriza TurnoGol en su cuenta de MercadoPago, MP avisa
 * por el canal global del panel, sin `?tenant=`. El route resuelve el complejo
 * por la cuenta FIRMADA (`data.id`) y encola; quién marca es el handler,
 * después de comprobar con un refresh. Spec:
 * `docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`.
 *
 * Lo que estos casos cuidan: que un evento no firmado no gaste ni una lectura,
 * que el `user_id` del body (que la firma NO cubre) nunca elija el complejo, y
 * que lo que no es de nadie conteste 200 para que MP no lo reintente.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const SECRET = 'secreto-de-prueba'
const TENANT = '11111111-2222-3333-4444-555555555555'
const CUENTA = '123456789'

const { findTenantUsingMpAccount, send, loggerError } = vi.hoisted(() => ({
  findTenantUsingMpAccount: vi.fn(),
  send: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/modules/payments/mock-mp', () => ({ MP_MOCK_ENABLED: false }))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({ resolveSubscriptionTenant: vi.fn() }),
}))
vi.mock('@/modules/tenants/tenant.service', () => ({ findTenantUsingMpAccount }))
vi.mock('@/shared/jobs/boss', () => ({ getBoss: async () => ({ send }) }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

function firmar(dataId: string): Record<string, string> {
  const ts = String(Date.now())
  const manifest = `id:${dataId.toLowerCase()};request-id:req-1;ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex')
  return {
    'x-signature': `ts=${ts},v1=${v1}`,
    'x-request-id': 'req-1',
    'content-type': 'application/json',
  }
}

// Mismo motivo que `mp-webhook-route-tenant-resolution.test.ts`: el grafo del
// route se carga una vez y en un hook, contra el `hookTimeout`.
let POST: (typeof import('@/app/api/webhooks/mercadopago/route'))['POST']
let NextRequest: (typeof import('next/server'))['NextRequest']

// Importar el route arrastra medio árbol de módulos (~20 s en frío): el
// timeout por defecto del hook quedaba justo.
beforeAll(async () => {
  ;({ POST } = await import('@/app/api/webhooks/mercadopago/route'))
  ;({ NextRequest } = await import('next/server'))
}, 60_000)

const URL_GLOBAL = 'https://turnogol.app/api/webhooks/mercadopago'

function postear(payload: Record<string, unknown>, headers: Record<string, string>) {
  return POST(
    new NextRequest(URL_GLOBAL, { method: 'POST', headers, body: JSON.stringify(payload) }),
  )
}

const vinculacion = (action: string, extra: Record<string, unknown> = {}) => ({
  id: 'evt-connect-1',
  type: 'mp-connect',
  action,
  data: { id: CUENTA },
  user_id: Number(CUENTA),
  ...extra,
})

describe('webhook de MercadoPago — vinculación de aplicaciones', () => {
  const env = process.env as Record<string, string | undefined>
  const secretOriginal = env['MP_WEBHOOK_SECRET']

  beforeEach(() => {
    findTenantUsingMpAccount.mockReset()
    send.mockReset()
    loggerError.mockReset()
    env['MP_WEBHOOK_SECRET'] = SECRET
  })

  afterEach(() => {
    if (secretOriginal === undefined) delete env['MP_WEBHOOK_SECRET']
    else env['MP_WEBHOOK_SECRET'] = secretOriginal
  })

  it('una desautorización encola con el complejo dueño de la cuenta firmada', async () => {
    findTenantUsingMpAccount.mockResolvedValue({ id: TENANT, name: 'El Vagón' })

    const res = await postear(vinculacion('application.deauthorized'), firmar(CUENTA))

    expect(res.status).toBe(200)
    expect(findTenantUsingMpAccount).toHaveBeenCalledWith(CUENTA)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT,
        mpEventId: 'evt-connect-1',
        eventType: 'mp-connect',
        mpPaymentId: CUENTA,
      }),
      expect.anything(),
    )
  })

  it('una autorización se ignora: la conexión la registra el callback de OAuth', async () => {
    const res = await postear(vinculacion('application.authorized'), firmar(CUENTA))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ignored: 'mp-connect' })
    expect(findTenantUsingMpAccount).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('un `user_id` distinto de la cuenta firmada no se actúa y deja rastro', async () => {
    const res = await postear(
      vinculacion('application.deauthorized', { user_id: 987654321 }),
      firmar(CUENTA),
    )

    // 200: reintentarlo no lo va a arreglar. Lo que no puede pasar es que el
    // `user_id` (sin firma) elija a qué complejo se le corta el cobro.
    expect(res.status).toBe(200)
    expect(findTenantUsingMpAccount).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('user_id distinto'),
      expect.objectContaining({ mpEventId: 'evt-connect-1' }),
    )
  })

  it('sin `user_id` en el body vale la cuenta firmada', async () => {
    findTenantUsingMpAccount.mockResolvedValue({ id: TENANT, name: 'El Vagón' })
    const sinUserId: Record<string, unknown> = vinculacion('application.deauthorized')
    delete sinUserId['user_id']

    const res = await postear(sinUserId, firmar(CUENTA))

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT }),
      expect.anything(),
    )
  })

  it('una cuenta que no cobra en ningún complejo contesta 200 sin encolar', async () => {
    // P. ej. la cuenta master desvinculando otra app, o un complejo que ya
    // apretó "Desconectar" (que limpia `mp_user_id`).
    findTenantUsingMpAccount.mockResolvedValue(null)

    const res = await postear(vinculacion('application.deauthorized'), firmar(CUENTA))

    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('si la búsqueda del complejo falla devuelve 500 para que MP reintente', async () => {
    findTenantUsingMpAccount.mockRejectedValue(new Error('connection reset'))

    const res = await postear(vinculacion('application.deauthorized'), firmar(CUENTA))

    expect(res.status).toBe(500)
    expect(send).not.toHaveBeenCalled()
  })

  it('si encolar falla devuelve 500', async () => {
    findTenantUsingMpAccount.mockResolvedValue({ id: TENANT, name: 'El Vagón' })
    send.mockRejectedValue(new Error('pg-boss caído'))

    const res = await postear(vinculacion('application.deauthorized'), firmar(CUENTA))

    expect(res.status).toBe(500)
  })

  it('la firma se valida ANTES de buscar el complejo', async () => {
    const res = await postear(vinculacion('application.deauthorized'), {
      'x-signature': 'ts=1,v1=firma-falsa',
      'x-request-id': 'req-1',
      'content-type': 'application/json',
    })

    expect(res.status).toBe(401)
    expect(findTenantUsingMpAccount).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('una firma de OTRA cuenta no sirve para esta', async () => {
    // La firma cubre `data.id`: un evento firmado para una cuenta no se puede
    // reusar cambiándole la cuenta en el body.
    const res = await postear(vinculacion('application.deauthorized'), firmar('111111111'))

    expect(res.status).toBe(401)
    expect(findTenantUsingMpAccount).not.toHaveBeenCalled()
  })
})
