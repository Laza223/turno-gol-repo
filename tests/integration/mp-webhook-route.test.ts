import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { QUEUE_PROCESS_MP_WEBHOOK } from '@/shared/jobs/queue-names'

// Wiring test for the POST /api/webhooks/mercadopago route handler.
//
// webhook-ssrf-guard.test.ts already covers "valid signature + non-numeric
// data.id → 400". This file covers the rest of the route's plumbing that no
// other test exercised: tenant/json/payload/signature error mapping, the
// enqueued job shape, the `?data.id=` signature override, the ACK body for
// unhandled types, the 500 on enqueue failure, and the inline-dispatch branch
// taken when MP_MOCK_ENABLED is true.
//
// Real code under test: the route + webhookPayloadSchema + verifyWebhookSignature
// + validatedJson. Only the queue (pg-boss) and the worker handler are stubbed —
// the route never touches the DB itself, so no DB is needed here.

const hoisted = vi.hoisted(() => ({
  sendSpy: vi.fn(),
  handleSpy: vi.fn(),
  mockState: { enabled: false },
}))

vi.mock('@/shared/jobs/boss', () => ({
  getBoss: vi.fn(async () => ({ send: hoisted.sendSpy })),
}))

vi.mock('@/modules/payments/mp-webhook.handler', () => ({
  handleMpWebhookJob: hoisted.handleSpy,
}))

// Keep computeMpMockEnabled real (payment.schema depends on it); only flip the
// MP_MOCK_ENABLED flag the route branches on. Getter → read at call time.
vi.mock('@/modules/payments/mock-mp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/payments/mock-mp')>()
  return {
    ...actual,
    get MP_MOCK_ENABLED() {
      return hoisted.mockState.enabled
    },
  }
})

import { POST as webhookRoute } from '@/app/api/webhooks/mercadopago/route'

const TENANT = '11111111-1111-1111-1111-111111111111'
const SECRET = 'a'.repeat(32)
const VALID_PAYLOAD = { id: 'evt-123', type: 'payment', data: { id: '12345' } }

const env = process.env as Record<string, string | undefined>
const originalSecret = env['MP_WEBHOOK_SECRET']

beforeEach(() => {
  hoisted.sendSpy.mockReset()
  hoisted.handleSpy.mockReset()
  hoisted.mockState.enabled = false
  delete env['MP_WEBHOOK_SECRET'] // no secret + NODE_ENV=test → signature passes
})

afterEach(() => {
  if (originalSecret === undefined) delete env['MP_WEBHOOK_SECRET']
  else env['MP_WEBHOOK_SECRET'] = originalSecret
})

function sign(
  secret: string,
  dataId: string,
  requestId = 'req-1',
  ts = '1718000000',
): Record<string, string> {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
  return { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${v1}` }
}

function makeReq(args: {
  tenant?: string | null
  body?: unknown
  rawBody?: string
  headers?: Record<string, string>
  queryDataId?: string
}): NextRequest {
  const sp = new URLSearchParams()
  if (args.tenant !== null && args.tenant !== undefined) sp.set('tenant', args.tenant)
  if (args.queryDataId) sp.set('data.id', args.queryDataId)
  const qs = sp.toString()
  return new NextRequest(`http://localhost/api/webhooks/mercadopago${qs ? `?${qs}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(args.headers ?? {}) },
    body: args.rawBody ?? JSON.stringify(args.body ?? {}),
  })
}

describe('POST /api/webhooks/mercadopago — request validation wiring', () => {
  it('responde 400 "missing tenant" cuando falta el query param tenant', async () => {
    // Tipo de evento que no se puede atribuir a nadie. `payment` y los dos de
    // suscripción YA NO caen acá: desde que MercadoPago avisa el cobro del SaaS
    // como un `payment` sin `?tenant=`, a esos se les pregunta a MP de quién
    // son (ver mp-webhook-route-tenant-resolution.test.ts).
    const res = await webhookRoute(
      makeReq({ tenant: null, body: { ...VALID_PAYLOAD, type: 'chargebacks' } }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'missing tenant' })
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
  })

  it('responde 400 "invalid json" cuando el body no es JSON parseable', async () => {
    const res = await webhookRoute(makeReq({ tenant: TENANT, rawBody: '{not-json' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid json' })
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
  })

  it('responde 400 "invalid payload" cuando el JSON no matchea el schema', async () => {
    // Falta data.id → webhookPayloadSchema.safeParse falla ANTES de chequear firma.
    const res = await webhookRoute(
      makeReq({ tenant: TENANT, body: { id: 'evt-1', type: 'payment', data: {} } }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid payload' })
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/mercadopago — signature wiring (secret set)', () => {
  it('responde 401 cuando falta la firma habiendo secret configurado', async () => {
    env['MP_WEBHOOK_SECRET'] = SECRET
    const res = await webhookRoute(makeReq({ tenant: TENANT, body: VALID_PAYLOAD }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid signature' })
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
  })

  it('responde 401 cuando el HMAC no coincide', async () => {
    env['MP_WEBHOOK_SECRET'] = SECRET
    const res = await webhookRoute(
      makeReq({
        tenant: TENANT,
        body: VALID_PAYLOAD,
        headers: { 'x-request-id': 'req-1', 'x-signature': 'ts=1718000000,v1=deadbeef' },
      }),
    )
    expect(res.status).toBe(401)
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
  })

  it('acepta y encola cuando el HMAC es correcto', async () => {
    env['MP_WEBHOOK_SECRET'] = SECRET
    const res = await webhookRoute(
      makeReq({
        tenant: TENANT,
        body: VALID_PAYLOAD,
        headers: sign(SECRET, VALID_PAYLOAD.data.id),
      }),
    )
    expect(res.status).toBe(200)
    expect(hoisted.sendSpy).toHaveBeenCalledTimes(1)
  })

  it('firma contra el data.id del querystring (override) y no contra el body', async () => {
    // MP puede mandar data.id por query. La firma debe validarse con el valor del
    // query (?data.id=99999), pero el job se arma con el data.id del body (12345).
    env['MP_WEBHOOK_SECRET'] = SECRET
    const res = await webhookRoute(
      makeReq({
        tenant: TENANT,
        body: VALID_PAYLOAD,
        queryDataId: '99999',
        headers: sign(SECRET, '99999'),
      }),
    )
    expect(res.status).toBe(200)
    expect(hoisted.sendSpy).toHaveBeenCalledTimes(1)
    const job = hoisted.sendSpy.mock.calls[0]![1] as { mpPaymentId: string }
    expect(job.mpPaymentId).toBe('12345')
  })
})

describe('POST /api/webhooks/mercadopago — dispatch & job shape', () => {
  it('encola el job con tenant del query, mpEventId, eventType y mpPaymentId correctos', async () => {
    const res = await webhookRoute(makeReq({ tenant: TENANT, body: VALID_PAYLOAD }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(hoisted.sendSpy).toHaveBeenCalledTimes(1)
    const [queue, job] = hoisted.sendSpy.mock.calls[0]!
    expect(queue).toBe(QUEUE_PROCESS_MP_WEBHOOK)
    expect(job).toMatchObject({
      tenantId: TENANT,
      mpEventId: 'evt-123',
      eventType: 'payment',
      mpPaymentId: '12345',
    })
    expect((job as { rawPayload: unknown }).rawPayload).toMatchObject({
      id: 'evt-123',
      type: 'payment',
      data: { id: '12345' },
    })
    // No se procesó inline: el branch de mock está apagado.
    expect(hoisted.handleSpy).not.toHaveBeenCalled()
  })

  it('encola también los tipos de suscripción manejados (eventType propagado)', async () => {
    const res = await webhookRoute(
      makeReq({
        tenant: TENANT,
        body: { id: 'evt-sub', type: 'subscription_preapproval', data: { id: '777' } },
      }),
    )
    expect(res.status).toBe(200)
    expect(hoisted.sendSpy).toHaveBeenCalledTimes(1)
    expect(hoisted.sendSpy.mock.calls[0]![1]).toMatchObject({
      eventType: 'subscription_preapproval',
    })
  })

  it('NO encola tipos no manejados y responde el ACK ignored', async () => {
    const res = await webhookRoute(
      makeReq({ tenant: TENANT, body: { id: 'evt-x', type: 'plan', data: { id: '12345' } } }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ignored: 'plan' })
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
    expect(hoisted.handleSpy).not.toHaveBeenCalled()
  })

  it('responde 500 "enqueue failed" cuando boss.send falla (MP reintenta)', async () => {
    hoisted.sendSpy.mockRejectedValueOnce(new Error('boss down'))
    const res = await webhookRoute(makeReq({ tenant: TENANT, body: VALID_PAYLOAD }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'enqueue failed' })
  })
})

describe('POST /api/webhooks/mercadopago — inline dispatch (MP_MOCK_ENABLED)', () => {
  it('procesa inline con handleMpWebhookJob y NO usa la cola', async () => {
    hoisted.mockState.enabled = true // bypassa firma y encola inline
    const res = await webhookRoute(makeReq({ tenant: TENANT, body: VALID_PAYLOAD }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(hoisted.handleSpy).toHaveBeenCalledTimes(1)
    expect(hoisted.handleSpy.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT,
      mpEventId: 'evt-123',
      eventType: 'payment',
      mpPaymentId: '12345',
    })
    expect(hoisted.sendSpy).not.toHaveBeenCalled()
  })

  it('responde 500 cuando el procesamiento inline falla', async () => {
    hoisted.mockState.enabled = true
    hoisted.handleSpy.mockRejectedValueOnce(new Error('handler boom'))
    const res = await webhookRoute(makeReq({ tenant: TENANT, body: VALID_PAYLOAD }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'enqueue failed' })
  })
})
