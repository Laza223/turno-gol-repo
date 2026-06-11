// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNearestCity } from '@/hooks/use-nearest-city'

type GeoSuccess = (pos: { coords: { latitude: number; longitude: number } }) => void
type GeoError = (err: { code: number }) => void

function stubGeolocation(getCurrentPosition: (success: GeoSuccess, error: GeoError) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
}

function stubFetchNearest(results: Array<{ city: string; province: string; distanceKm: number | null }>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results, total: results.length }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('useNearestCity', () => {
  it('con permiso y un complejo cerca → found con su ciudad/provincia', async () => {
    stubGeolocation((success) => success({ coords: { latitude: -31.42, longitude: -64.18 } }))
    const fetchMock = stubFetchNearest([{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }])

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.status).toBe('found'))
    expect(result.current).toEqual({ status: 'found', city: 'Córdoba', province: 'Córdoba' })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/public/search?')
    expect(url).toContain('sort=distance')
    expect(url).toContain('limit=1')
    expect(url).toContain('lat=-31.42')
    expect(url).toContain('lng=-64.18')
  })

  it('mientras espera la posición, el estado es locating', () => {
    stubGeolocation(() => {
      /* nunca responde */
    })
    const { result } = renderHook(() => useNearestCity())
    expect(result.current.status).toBe('locating')
  })

  it('permiso denegado (code 1) → denied, sin llamar al endpoint', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    const fetchMock = stubFetchNearest([])

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('navegador sin geolocalización → unsupported', () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    const { result } = renderHook(() => useNearestCity())
    expect(result.current.status).toBe('unsupported')
  })

  it('el complejo más cercano queda fuera del radio → no_results', async () => {
    stubGeolocation((success) => success({ coords: { latitude: -31.42, longitude: -64.18 } }))
    stubFetchNearest([{ city: 'Salta', province: 'Salta', distanceKm: 320 }])

    const { result } = renderHook(() => useNearestCity({ maxDistanceKm: 50 }))

    await waitFor(() => expect(result.current.status).toBe('no_results'))
  })

  it('sin resultados en la búsqueda → no_results', async () => {
    stubGeolocation((success) => success({ coords: { latitude: -31.42, longitude: -64.18 } }))
    stubFetchNearest([])

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.status).toBe('no_results'))
  })

  it('fallo de red al buscar → error (no bloqueante)', async () => {
    stubGeolocation((success) => success({ coords: { latitude: -31.42, longitude: -64.18 } }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('timeout u otro error de posición (code != 1) → error', async () => {
    stubGeolocation((_success, error) => error({ code: 3 }))

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
