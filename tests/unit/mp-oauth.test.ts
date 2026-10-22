import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encrypt } from '@/lib/crypto/encrypt'
import { refreshMpAccessToken } from '@/modules/payments/mp-oauth'
import { MpGatewayError, MpGrantRevokedError } from '@/modules/payments/payment.errors'

let encryptedRefresh: string

// Las tres se leen en el momento de la llamada, no al importar, así que van acá
// y no a nivel de módulo: una asignación de módulo corre una sola vez, y quedaba
// a merced de lo que hiciera con esas claves cualquier otro archivo del worker
// (los archivos comparten `process.env` bajo `singleThread`). Este archivo
// pasaba sólo porque `mp-oauth-state-csrf.test.ts` filtraba las suyas.
beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64))
  vi.stubEnv('MP_CLIENT_ID', 'client-123')
  vi.stubEnv('MP_CLIENT_SECRET', 'secret-456')
  encryptedRefresh = encrypt('old-refresh-token')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('refreshMpAccessToken', () => {
  it('posts grant_type=refresh_token with the decrypted token and maps the response', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            user_id: 777,
            public_key: 'pub-key',
          }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshMpAccessToken(encryptedRefresh)

    expect(result).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      userId: '777',
      publicKey: 'pub-key',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe('https://api.mercadopago.com/oauth/token')
    const body = JSON.parse(String(call[1]?.body))
    expect(body).toMatchObject({
      client_id: 'client-123',
      client_secret: 'secret-456',
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh-token',
    })
  })

  it('throws MpGatewayError on a non-OK response', async () => {
    mockFetch(() => new Response('nope', { status: 401 }))
    await expect(refreshMpAccessToken(encryptedRefresh)).rejects.toBeInstanceOf(MpGatewayError)
  })

  it('throws when the response is missing tokens', async () => {
    mockFetch(() => new Response(JSON.stringify({ access_token: 'x' }), { status: 200 }))
    await expect(refreshMpAccessToken(encryptedRefresh)).rejects.toBeInstanceOf(MpGatewayError)
  })
})

// Aviso de MP desconectado (migr. 100): solo estos dos códigos dicen "el
// complejo revocó el permiso" y marcan. Todo lo demás es un error de gateway
// que no le puede decir al dueño "reconectá".
describe('refreshMpAccessToken: clasificación del rechazo', () => {
  it.each(['invalid_grant', 'unauthorized_client'] as const)(
    '400 con %s → MpGrantRevokedError con el código',
    async (code) => {
      mockFetch(
        () =>
          new Response(JSON.stringify({ error: code, message: code, status: 400, cause: [] }), {
            status: 400,
          }),
      )
      const err = await refreshMpAccessToken(encryptedRefresh).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(MpGrantRevokedError)
      expect((err as MpGrantRevokedError).mpError).toBe(code)
    },
  )

  it('el código en `message` (sin `error`) también cuenta', async () => {
    mockFetch(() => new Response(JSON.stringify({ message: 'invalid_grant' }), { status: 400 }))
    await expect(refreshMpAccessToken(encryptedRefresh)).rejects.toBeInstanceOf(MpGrantRevokedError)
  })

  it.each([
    ['invalid_client (credenciales de TurnoGol)', 400, JSON.stringify({ error: 'invalid_client' })],
    ['5xx aunque diga invalid_grant', 503, JSON.stringify({ error: 'invalid_grant' })],
    ['body no JSON', 400, 'Bad Request'],
    ['texto libre que menciona el código', 400, JSON.stringify({ error: 'invalid_grant: oops' })],
  ])('%s → MpGatewayError, no revocación', async (_caso, status, body) => {
    mockFetch(() => new Response(body, { status }))
    const err = await refreshMpAccessToken(encryptedRefresh).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MpGatewayError)
    expect(err).not.toBeInstanceOf(MpGrantRevokedError)
  })

  it('un `message` libre de MP no llega al mensaje del error (va a logs y Sentry)', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ message: 'Invalid refresh_token TG-123-secreto' }), {
          status: 400,
        }),
    )
    const err = await refreshMpAccessToken(encryptedRefresh).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(MpGatewayError)
    expect((err as Error).message).toBe('MP token refresh failed (HTTP 400)')
  })

  it('un código OAuth sí va al mensaje, para poder diagnosticarlo', async () => {
    mockFetch(() => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 }))
    const err = await refreshMpAccessToken(encryptedRefresh).catch((e: unknown) => e)
    expect((err as Error).message).toBe('MP token refresh failed (HTTP 400, invalid_client)')
  })
})
