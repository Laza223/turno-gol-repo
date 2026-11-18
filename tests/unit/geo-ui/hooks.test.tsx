// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLocalitySearch } from '@/components/geo/use-locality-search'
import { useCurrentPlace } from '@/components/geo/use-current-place'
import type { GeoLocality } from '@/modules/geo/geo.types'

const LUJAN: GeoLocality = {
  city: 'Luján',
  province: 'Buenos Aires',
  department: 'Partido de Luján',
  lat: -34.57,
  lng: -59.1,
  source: 'dataset',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useLocalitySearch', () => {
  it('no pide nada por debajo del mínimo de caracteres', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLocalitySearch('a'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ results: [], status: 'idle' })
  })

  it('espera el debounce, pide una vez y devuelve los resultados', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => jsonResponse({ results: [LUJAN] }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ q }) => useLocalitySearch(q), {
      initialProps: { q: 'lu' },
    })
    expect(result.current.status).toBe('loading')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    rerender({ q: 'luj' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('q=luj')
    expect(result.current).toEqual({ results: [LUJAN], status: 'done' })
  })

  it('cancela la consulta anterior cuando cambia el texto', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal)
        return new Promise<Response>(() => {})
      }),
    )
    const { rerender } = renderHook(({ q }) => useLocalitySearch(q), {
      initialProps: { q: 'merc' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    rerender({ q: 'merced' })
    expect(signals[0]?.aborted).toBe(true)
  })

  it('reutiliza el cache: la misma consulta no vuelve a pedir', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => jsonResponse({ results: [LUJAN] }))
    vi.stubGlobal('fetch', fetchMock)
    const first = renderHook(() => useLocalitySearch('Cañuelas'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    first.unmount()
    const second = renderHook(() => useLocalitySearch('canuelas'))
    expect(second.result.current.status).toBe('done')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un error HTTP o de red queda en status error, sin tirar', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 500)),
    )
    const { result } = renderHook(() => useLocalitySearch('pergamino'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current.status).toBe('error')
  })

  it('degraded se distingue de "sin resultados"', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [], degraded: true })),
    )
    const { result } = renderHook(() => useLocalitySearch('chivilcoy'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(result.current.status).toBe('degraded')
  })
})

type GeoStub = {
  getCurrentPosition: (ok: PositionCallback, err?: PositionErrorCallback | null) => void
}

function stubGeolocation(geo: GeoStub | undefined) {
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
}

function position(latitude: number, longitude: number): GeolocationPosition {
  return { coords: { latitude, longitude } } as GeolocationPosition
}

describe('useCurrentPlace', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
  })

  it('no pide la posición al montar', () => {
    const getCurrentPosition = vi.fn()
    stubGeolocation({ getCurrentPosition })
    const { result } = renderHook(() => useCurrentPlace('locality'))
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe('idle')
  })

  it('unsupported si el navegador no tiene geolocalización', () => {
    stubGeolocation(undefined)
    const { result } = renderHook(() => useCurrentPlace('locality'))
    act(() => result.current.locate())
    expect(result.current.state.status).toBe('unsupported')
  })

  it('denied (code 1) y timeout (code 3) se distinguen', () => {
    stubGeolocation({
      getCurrentPosition: (_ok, err) => err?.({ code: 1 } as GeolocationPositionError),
    })
    const denied = renderHook(() => useCurrentPlace('locality'))
    act(() => denied.result.current.locate())
    expect(denied.result.current.state.status).toBe('denied')

    stubGeolocation({
      getCurrentPosition: (_ok, err) => err?.({ code: 3 } as GeolocationPositionError),
    })
    const timeout = renderHook(() => useCurrentPlace('locality'))
    act(() => timeout.result.current.locate())
    expect(timeout.result.current.state.status).toBe('timeout')
  })

  it('result null es outside_argentina', async () => {
    stubGeolocation({ getCurrentPosition: (ok) => ok(position(40.4, -3.7)) })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ result: null })),
    )
    const { result } = renderHook(() => useCurrentPlace('locality'))
    await act(async () => {
      result.current.locate()
    })
    expect(result.current.state.status).toBe('outside_argentina')
  })

  it('locality: baja precisión y coordenadas a 3 decimales', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok(position(-34.570349999, -59.105049999)),
    )
    stubGeolocation({ getCurrentPosition })
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({
        result: { city: 'Luján', province: 'Buenos Aires', lat: -34.57, lng: -59.105 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onFound = vi.fn()
    const { result } = renderHook(() => useCurrentPlace('locality'))
    await act(async () => {
      result.current.locate(onFound)
    })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('lat=-34.57&lng=-59.105&precision=locality')
    expect(getCurrentPosition.mock.calls[0]).toHaveLength(3)
    const opts = (getCurrentPosition.mock.calls[0] as unknown[])[2]
    expect(opts).toMatchObject({ enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 })
    expect(result.current.state.status).toBe('found')
    expect(onFound).toHaveBeenCalledWith(expect.objectContaining({ city: 'Luján' }))
  })

  it('address: alta precisión y 6 decimales', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok(position(-34.5703491234, -59.1050499999)),
    )
    stubGeolocation({ getCurrentPosition })
    const fetchMock = vi.fn(async (_url: string) =>
      jsonResponse({
        result: {
          city: 'Luján',
          province: 'Buenos Aires',
          address: 'Bartolomé Mitre 800',
          lat: -34.57,
          lng: -59.1,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCurrentPlace('address'))
    await act(async () => {
      result.current.locate()
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'lat=-34.570349&lng=-59.10505&precision=address',
    )
    const opts = (getCurrentPosition.mock.calls[0] as unknown[])[2]
    expect(opts).toMatchObject({ enableHighAccuracy: true, timeout: 10000 })
  })

  it('reset vuelve a idle', () => {
    stubGeolocation({
      getCurrentPosition: (_ok, err) => err?.({ code: 1 } as GeolocationPositionError),
    })
    const { result } = renderHook(() => useCurrentPlace('locality'))
    act(() => result.current.locate())
    act(() => result.current.reset())
    expect(result.current.state.status).toBe('idle')
  })
})
