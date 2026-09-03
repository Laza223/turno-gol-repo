import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encrypt } from '@/lib/crypto/encrypt'
import { refreshMpAccessToken } from '@/modules/payments/mp-oauth'
import { MpGatewayError } from '@/modules/payments/payment.errors'

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
