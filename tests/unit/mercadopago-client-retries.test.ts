import { afterEach, describe, expect, it, vi } from 'vitest'
import { Payment } from 'mercadopago'
import { mpClientFromPlaintext } from '@/lib/mercadopago'

/**
 * El SDK 3 de MercadoPago reintenta tres veces por defecto (cuatro intentos) y
 * también los 429. `mpClientFromPlaintext` lo deja como el SDK 2: dos intentos,
 * solo ante un 5xx o un corte de red. Se prueba con el SDK real y un `fetch`
 * falso, así el test se rompe si el SDK cambia cómo lee esas opciones.
 */
function respond(status: number): Response {
  return new Response(JSON.stringify({ message: `status ${status}` }), {
    status,
    headers: { 'content-type': 'application/json', 'retry-after': '1' },
  })
}

async function getPayment(fetchMock: typeof fetch): Promise<unknown> {
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers()
  const call = new Payment(mpClientFromPlaintext('TEST-token')).get({ id: '123' })
  const settled = call.then(
    () => null,
    (err: unknown) => err,
  )
  // Más que cualquier espera del SDK (backoff de 1 s y el timeout de 8 s).
  await vi.advanceTimersByTimeAsync(60_000)
  return settled
}

describe('reintentos del cliente de MercadoPago', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('ante un 5xx hace dos intentos y corta', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respond(503))
    const err = await getPayment(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(err).toMatchObject({ status: 503 })
  })

  it('un 429 no se reintenta', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respond(429))
    const err = await getPayment(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(err).toMatchObject({ status: 429 })
  })

  it('un 4xx no se reintenta', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => respond(400))
    const err = await getPayment(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(err).toMatchObject({ status: 400 })
  })

  it('ante un corte de red hace dos intentos', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const err = await getPayment(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(err).toBeInstanceOf(Error)
  })
})
