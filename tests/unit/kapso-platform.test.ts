import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KapsoPlatformError,
  createKapsoSetupLink,
  ensureKapsoMessageWebhook,
  findKapsoCustomer,
  findOrCreateKapsoCustomer,
  getKapsoPhoneNumber,
  getKapsoPhoneNumberHealth,
  listKapsoPhoneNumbers,
} from '@/lib/kapso/platform'

const BASE = 'https://api.kapso.ai/platform/v1'
const fetchMock = vi.fn<typeof fetch>()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function call(i: number): { url: string; init: RequestInit } {
  const c = fetchMock.mock.calls[i]
  if (!c) throw new Error(`fetch no se llamó ${i + 1} veces`)
  return { url: String(c[0]), init: c[1] ?? {} }
}

beforeEach(() => {
  vi.stubEnv('KAPSO_API_KEY', 'k-test')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('kapso platform', () => {
  it('busca el cliente por id externo, con el header de API key', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [{ id: 'c-1', name: 'x', external_customer_id: 't 1' }], meta: {} }),
    )
    expect(await findKapsoCustomer('t 1')).toEqual({ id: 'c-1' })
    const { url, init } = call(0)
    expect(url).toBe(`${BASE}/customers?external_customer_id=t%201`)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('k-test')
  })

  it('si Kapso ignora el filtro, no toma el cliente de otro complejo', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [{ id: 'c-otro', external_customer_id: 'otro-tenant' }] }),
    )
    expect(await findKapsoCustomer('t')).toBeNull()
  })

  it('findOrCreate no crea si ya existe, y crea si no', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: 'c-1', external_customer_id: 't' }] }))
    expect(await findOrCreateKapsoCustomer({ externalId: 't', name: 'N' })).toEqual({ id: 'c-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(json({ data: [] }))
    fetchMock.mockResolvedValueOnce(json({ data: { id: 'c-2' } }, 201))
    expect(await findOrCreateKapsoCustomer({ externalId: 't', name: 'N' })).toEqual({ id: 'c-2' })
    const { url, init } = call(2)
    expect(url).toBe(`${BASE}/customers`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      customer: { name: 'N', external_customer_id: 't' },
    })
  })

  it('crea el setup link de coexistencia y devuelve la url', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { url: 'https://app.kapso.ai/x' } }, 201))
    const res = await createKapsoSetupLink('c-1', {
      successUrl: 'https://a/ok',
      failureUrl: 'https://a/ko',
    })
    expect(res).toEqual({ url: 'https://app.kapso.ai/x' })
    const { url, init } = call(0)
    expect(url).toBe(`${BASE}/customers/c-1/setup_links`)
    expect(JSON.parse(init.body as string)).toEqual({
      setup_link: {
        allowed_connection_types: ['coexistence'],
        meta_billing_mode: 'partner_managed',
        language: 'es',
        success_redirect_url: 'https://a/ok',
        failure_redirect_url: 'https://a/ko',
      },
    })
  })

  it('con reconnectPhoneNumber el setup link reconecta ese número', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { url: 'https://app.kapso.ai/x' } }, 201))
    await createKapsoSetupLink('c-1', {
      successUrl: 'https://a/ok',
      failureUrl: 'https://a/ko',
      reconnectPhoneNumber: '+54 9 2323 60-9056',
    })
    expect(JSON.parse(call(0).init.body as string).setup_link).toMatchObject({
      allowed_connection_types: ['coexistence'],
      meta_billing_mode: 'partner_managed',
      reconnect_phone_number: '+54 9 2323 60-9056',
    })
  })

  it.each(['https://evil.test/x', 'http://app.kapso.ai/x', 'https://kapso.ai.evil.test/x'])(
    'un link de conexión fuera de https://*.kapso.ai (%s) es KapsoPlatformError',
    async (bad) => {
      fetchMock.mockResolvedValueOnce(json({ data: { url: bad } }, 201))
      await expect(
        createKapsoSetupLink('c-1', { successUrl: 'https://a/ok', failureUrl: 'https://a/ko' }),
      ).rejects.toBeInstanceOf(KapsoPlatformError)
    },
  )

  it('getKapsoPhoneNumber mapea los campos y devuelve null ante 404', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        data: {
          id: 'pn-1',
          business_account_id: 'waba-1',
          customer_id: 'c-1',
          display_phone_number: '+54 9 11 1234-5678',
          is_coexistence: true,
        },
      }),
    )
    expect(await getKapsoPhoneNumber('pn-1')).toEqual({
      phoneNumberId: 'pn-1',
      businessAccountId: 'waba-1',
      customerId: 'c-1',
      displayPhoneNumber: '+54 9 11 1234-5678',
      isCoexistence: true,
    })
    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, 404))
    expect(await getKapsoPhoneNumber('pn-2')).toBeNull()
  })

  it('listKapsoPhoneNumbers filtra por customer_id (y descarta los de otro cliente)', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        data: [
          { id: 'pn-1', customer_id: 'c-1', is_coexistence: false },
          { id: 'pn-2', customer_id: 'c-otro', is_coexistence: true },
        ],
      }),
    )
    const list = await listKapsoPhoneNumbers('c-1')
    expect(list).toHaveLength(1)
    expect(list[0]?.phoneNumberId).toBe('pn-1')
    expect(list[0]?.isCoexistence).toBe(false)
    expect(call(0).url).toBe(`${BASE}/whatsapp/phone_numbers?customer_id=c-1`)
  })

  it('ensureKapsoMessageWebhook es idempotente: con uno existente no hace POST', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [{ phone_number_id: 'pn-1', url: 'https://a/hook' }] }),
    )
    await ensureKapsoMessageWebhook({ phoneNumberId: 'pn-1', url: 'https://a/hook', secret: 's' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(call(0).url).toBe(`${BASE}/whatsapp/phone_numbers/pn-1/webhooks`)
  })

  it('ensureKapsoMessageWebhook crea el webhook si el número no tiene uno con esa url', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ data: [{ phone_number_id: 'pn-1', url: 'https://otra/hook' }] }),
    )
    fetchMock.mockResolvedValueOnce(json({ data: { id: 'w-1' } }, 201))
    await ensureKapsoMessageWebhook({ phoneNumberId: 'pn-1', url: 'https://a/hook', secret: 'sec' })
    const { url, init } = call(1)
    expect(url).toBe(`${BASE}/whatsapp/phone_numbers/pn-1/webhooks`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      whatsapp_webhook: {
        url: 'https://a/hook',
        secret_key: 'sec',
        kind: 'kapso',
        payload_version: 'v2',
        events: ['whatsapp.message.received', 'whatsapp.message.sent'],
        active: true,
      },
    })
  })

  it('si Kapso devuelve el secret en el error, no queda en el mensaje', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [] }))
    fetchMock.mockResolvedValueOnce(json({ error: 'bad', echo: { secret_key: 'super-sec' } }, 422))
    const err = await ensureKapsoMessageWebhook({
      phoneNumberId: 'pn-1',
      url: 'https://a/hook',
      secret: 'super-sec',
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KapsoPlatformError)
    expect((err as Error).message).not.toContain('super-sec')
  })

  it('un non-2xx es KapsoPlatformError con el status', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'boom' }, 500))
    await expect(findKapsoCustomer('t')).rejects.toMatchObject({
      name: 'KapsoPlatformError',
      status: 500,
    })
  })

  it('una respuesta con forma inesperada es KapsoPlatformError', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: 'no es una lista' }))
    await expect(findKapsoCustomer('t')).rejects.toBeInstanceOf(KapsoPlatformError)
  })

  it('un fallo de red o timeout es KapsoPlatformError con status 0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    await expect(findKapsoCustomer('t')).rejects.toMatchObject({ status: 0 })
  })

  describe('getKapsoPhoneNumberHealth (ejemplos de la doc de Kapso)', () => {
    it('desconectado: lee la conexión de Meta del check, sin envoltorio `data`', async () => {
      fetchMock.mockResolvedValueOnce(
        json({
          status: 'unhealthy',
          timestamp: '2026-09-17T09:12:00Z',
          checks: {
            phone_number_access: { passed: true },
            phone_number_connection: { passed: false, details: { status: 'DISCONNECTED' } },
            messaging_health: { passed: true, overall_status: 'AVAILABLE' },
            webhook_verified: { passed: true },
          },
        }),
      )
      expect(await getKapsoPhoneNumberHealth('pn 1')).toEqual({
        status: 'unhealthy',
        connection: 'DISCONNECTED',
        messaging: 'AVAILABLE',
        accessOk: true,
        failingChecks: ['phone_number_connection'],
      })
      expect(call(0).url).toBe(`${BASE}/whatsapp/phone_numbers/pn%201/health`)
    })

    it('token inválido: acceso en falso y la lista de checks que fallan', async () => {
      fetchMock.mockResolvedValueOnce(
        json({
          status: 'unhealthy',
          retry_after: '2025-01-20T18:27:45Z',
          checks: {
            phone_number_access: { passed: false, error: 'Invalid OAuth access token' },
            messaging_health: { passed: false, error: 'Invalid OAuth access token' },
            webhook_subscription: { passed: false },
            webhook_verified: { passed: true, verified_at: '2025-01-10T08:15:30Z' },
          },
        }),
      )
      expect(await getKapsoPhoneNumberHealth('pn-1')).toMatchObject({
        accessOk: false,
        connection: null,
        messaging: null,
        failingChecks: ['phone_number_access', 'messaging_health', 'webhook_subscription'],
      })
    })

    it('bloqueado: el estado de mensajería sale de `overall_status`', async () => {
      fetchMock.mockResolvedValueOnce(
        json({
          status: 'unhealthy',
          checks: { messaging_health: { passed: false, overall_status: 'BLOCKED' } },
        }),
      )
      expect((await getKapsoPhoneNumberHealth('pn-1'))?.messaging).toBe('BLOCKED')
    })

    it('`status: error` sin checks', async () => {
      fetchMock.mockResolvedValueOnce(
        json({ status: 'error', error: 'Service temporarily unavailable' }),
      )
      expect(await getKapsoPhoneNumberHealth('pn-1')).toEqual({
        status: 'error',
        connection: null,
        messaging: null,
        accessOk: null,
        failingChecks: [],
      })
    })

    it('404 es null: Kapso ya no tiene el número', async () => {
      fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404))
      expect(await getKapsoPhoneNumberHealth('pn-1')).toBeNull()
    })

    it.each([429, 401])('un %i es KapsoPlatformError con el status', async (status) => {
      fetchMock.mockResolvedValueOnce(json({ error: 'x' }, status))
      await expect(getKapsoPhoneNumberHealth('pn-1')).rejects.toMatchObject({ status })
    })

    it('un `status` que no conocemos es KapsoPlatformError con el status 2xx', async () => {
      fetchMock.mockResolvedValueOnce(json({ status: 'raro' }))
      await expect(getKapsoPhoneNumberHealth('pn-1')).rejects.toMatchObject({
        name: 'KapsoPlatformError',
        status: 200,
      })
    })
  })

  it('sin KAPSO_API_KEY falla sin llamar a la red', async () => {
    vi.stubEnv('KAPSO_API_KEY', '')
    await expect(findKapsoCustomer('t')).rejects.toBeInstanceOf(KapsoPlatformError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
