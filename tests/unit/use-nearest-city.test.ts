// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useNearestCity } from '@/hooks/use-nearest-city'
import { parseZona, ZONA_STORAGE_KEY } from '@/lib/zona-storage'

type GeoSuccess = (pos: { coords: { latitude: number; longitude: number } }) => void
type GeoError = (err: { code: number }) => void

function stubGeolocation(getCurrentPosition: (success: GeoSuccess, error: GeoError) => void) {
  const spy = vi.fn(getCurrentPosition)
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: spy },
  })
  return spy
}

/** `null` = el navegador no tiene Permissions API. */
function stubPermission(state: PermissionState | null) {
  const query = vi.fn().mockResolvedValue({ state })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: state === null ? undefined : { query },
  })
  return query
}

function stubFetchNearest(
  results: Array<{ city: string; province: string; distanceKm: number | null }>,
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results, total: results.length }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const found = (success: GeoSuccess) =>
  success({ coords: { latitude: -31.4201, longitude: -64.1888 } })

const CORDOBA = [{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }]

/** Deja correr la consulta de permisos (una promesa) sin esperar ningún estado concreto. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => {
  localStorage.clear()
  stubPermission(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

describe('useNearestCity — no pide la ubicación sola', () => {
  it('sin zona y con permiso "prompt": no llama a geolocation (evita el cartel en cada visita)', async () => {
    const query = stubPermission('prompt')
    const geo = stubGeolocation(found)
    stubFetchNearest(CORDOBA)

    const { result } = renderHook(() => useNearestCity())
    await waitFor(() => expect(query).toHaveBeenCalled())
    await flush()

    expect(geo).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('sin Permissions API tampoco pide: queda el botón', async () => {
    const geo = stubGeolocation(found)
    stubFetchNearest(CORDOBA)

    const { result } = renderHook(() => useNearestCity())
    await flush()

    expect(geo).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe('idle')
  })

  it('con la zona ya guardada no llama a geolocation ni siquiera con permiso concedido', async () => {
    localStorage.setItem(
      ZONA_STORAGE_KEY,
      JSON.stringify({ city: 'Luján', province: 'Buenos Aires' }),
    )
    const query = stubPermission('granted')
    const geo = stubGeolocation(found)
    stubFetchNearest(CORDOBA)

    const { result } = renderHook(() => useNearestCity())
    await flush()

    expect(query).not.toHaveBeenCalled()
    expect(geo).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('permiso "denied" → denied, sin pedir nada', async () => {
    stubPermission('denied')
    const geo = stubGeolocation(found)

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.state.status).toBe('denied'))
    expect(geo).not.toHaveBeenCalled()
  })

  it('permiso ya concedido y sin zona → resuelve sola (consultar no muestra cartel) y la guarda', async () => {
    stubPermission('granted')
    stubGeolocation(found)
    stubFetchNearest(CORDOBA)

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.state.status).toBe('found'))
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Córdoba')
  })
})

describe('useNearestCity — locate()', () => {
  it('con permiso y un complejo cerca → found, y guarda ciudad + coordenadas redondeadas', async () => {
    stubPermission('prompt')
    stubGeolocation(found)
    const fetchMock = stubFetchNearest(CORDOBA)

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('found'))
    expect(result.current.state).toEqual({ status: 'found', city: 'Córdoba', province: 'Córdoba' })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/public/search?')
    expect(url).toContain('sort=distance')
    expect(url).toContain('limit=1')
    expect(url).toContain('lat=-31.420100')
    expect(url).toContain('lng=-64.188800')

    // Lo guardado va a ~1 km: ni la URL compartida ni el storage delatan la casa.
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))).toEqual({
      city: 'Córdoba',
      province: 'Córdoba',
      lat: -31.42,
      lng: -64.19,
    })
  })

  it('mientras espera la posición, el estado es locating', async () => {
    stubGeolocation(() => {
      /* nunca responde */
    })
    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())
    expect(result.current.state.status).toBe('locating')
  })

  it('permiso denegado (code 1) → denied, sin llamar al endpoint ni guardar', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    const fetchMock = stubFetchNearest([])

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('denied'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(ZONA_STORAGE_KEY)).toBeNull()
  })

  it('navegador sin geolocalización → unsupported', () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    const { result } = renderHook(() => useNearestCity())
    expect(result.current.state.status).toBe('unsupported')
  })

  it('el complejo más cercano queda fuera del radio → no_results, sin guardar', async () => {
    stubGeolocation(found)
    stubFetchNearest([{ city: 'Salta', province: 'Salta', distanceKm: 320 }])

    const { result } = renderHook(() => useNearestCity({ maxDistanceKm: 50 }))
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('no_results'))
    expect(localStorage.getItem(ZONA_STORAGE_KEY)).toBeNull()
  })

  it('sin resultados en la búsqueda → no_results', async () => {
    stubGeolocation(found)
    stubFetchNearest([])

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('no_results'))
  })

  it('fallo de red al buscar → error (no bloqueante)', async () => {
    stubGeolocation(found)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('timeout u otro error de posición (code != 1) → error', async () => {
    stubGeolocation((_success, error) => error({ code: 3 }))

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })
})
