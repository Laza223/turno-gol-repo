import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Hardening de la auditoría integral del 2026-09-06
 * (`mp-gateway.implementation.ts:327-336`).
 *
 * `mpGet` era el único `fetch` del gateway sin timeout: el resto va por el SDK,
 * que tiene 8 s. Lo llama `resolveSubscriptionTenant`, y ESO corre en el route
 * handler del webhook ANTES de encolar el trabajo — o sea que un MercadoPago
 * lento colgaba la función serverless entera, con el pago ya cobrado del otro
 * lado y el aviso sin procesar.
 */
import { MercadoPagoGateway, MP_GET_TIMEOUT_MS } from '@/modules/payments/mp-gateway.implementation'

const gateway = new MercadoPagoGateway('token-en-claro', { plaintextToken: true })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mpGet corta si MercadoPago no contesta', () => {
  it('pasa un AbortSignal con el mismo tope que el SDK', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 404 })),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await gateway.resolveSubscriptionTenant('subscription_preapproval', 'PRE-123')

    expect(fetchSpy).toHaveBeenCalled()
    const init = fetchSpy.mock.calls[0]![1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(MP_GET_TIMEOUT_MS).toBe(8000)
  })

  it('un MercadoPago que nunca responde aborta en vez de colgar el request', async () => {
    // El signal real tarda 8 s; acá se comprueba el cableado, que es lo que
    // estaba roto: sin `signal`, el fetch no tenía forma de abortar nunca.
    const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        )
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const controller = new AbortController()
    const original = AbortSignal.timeout
    vi.stubGlobal('AbortSignal', {
      ...AbortSignal,
      timeout: () => controller.signal,
    })

    const pendiente = gateway.resolveSubscriptionTenant('subscription_preapproval', 'PRE-123')
    controller.abort()

    // Lo que importa es que la promesa TERMINE. Antes del arreglo se quedaba
    // pendiente para siempre, y con ella la función serverless del webhook.
    // Que resuelva con error es correcto: el route lo traduce y pg-boss
    // reintenta.
    await expect(pendiente).rejects.toThrow(/resolve tenant/i)
    expect(typeof original).toBe('function')
  })
})
