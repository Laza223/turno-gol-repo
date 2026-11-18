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

/** Lo que responde `/api/public/geo/reverse` (el servidor ya devuelve la localidad, no la dirección). */
function stubFetchReverse(body: unknown = { result: CORDOBA }, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const found = (success: GeoSuccess) =>
  success({ coords: { latitude: -31.4201, longitude: -64.1888 } })

const CORDOBA = { city: 'Córdoba', province: 'Córdoba', lat: -31.4167, lng: -64.1833 }

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
    stubFetchReverse()

    const { result } = renderHook(() => useNearestCity())
    await waitFor(() => expect(query).toHaveBeenCalled())
    await flush()

    expect(geo).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('sin Permissions API tampoco pide: queda el botón', async () => {
    const geo = stubGeolocation(found)
    stubFetchReverse()

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
    stubFetchReverse()

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
    stubFetchReverse()

    const { result } = renderHook(() => useNearestCity())

    await waitFor(() => expect(result.current.state.status).toBe('found'))
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Córdoba')
  })
})

describe('useNearestCity — locate()', () => {
  it('ubica al jugador en SU localidad (reverse, precision=locality) y guarda coordenadas a ~1 km', async () => {
    stubPermission('prompt')
    stubGeolocation(found)
    const fetchMock = stubFetchReverse()

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('found'))
    expect(result.current.state).toEqual({
      status: 'found',
      city: 'Córdoba',
      province: 'Córdoba',
      lat: -31.42,
      lng: -64.18,
    })

    // Nunca sale la posición exacta ni se pide precisión de dirección.
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/public/geo/reverse?')
    expect(url).toContain('precision=locality')
    expect(url).toContain('lat=-31.42&')
    expect(url).not.toContain('-31.4201')

    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))).toEqual({
      city: 'Córdoba',
      province: 'Córdoba',
      lat: -31.42,
      lng: -64.18,
    })
  })

  it('una localidad SIN complejos también se guarda: ya no hay corte por distancia', async () => {
    stubGeolocation(found)
    stubFetchReverse({
      result: { city: 'Mercedes', province: 'Buenos Aires', lat: -34.65, lng: -59.43 },
    })

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('found'))
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Mercedes')
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
    const fetchMock = stubFetchReverse()

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

  it('fuera de Argentina (sin resultado) → outside_argentina, sin guardar', async () => {
    stubGeolocation(found)
    stubFetchReverse({ result: null })

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('outside_argentina'))
    expect(localStorage.getItem(ZONA_STORAGE_KEY)).toBeNull()
  })

  it('fallo de red al ubicar → error (no bloqueante)', async () => {
    stubGeolocation(found)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('timeout de la posición (code 3) → timeout', async () => {
    stubGeolocation((_success, error) => error({ code: 3 }))

    const { result } = renderHook(() => useNearestCity())
    act(() => result.current.locate())

    await waitFor(() => expect(result.current.state.status).toBe('timeout'))
  })
})
