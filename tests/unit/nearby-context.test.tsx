// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { NearbyProvider, useNearby } from '@/app/home/nearby-context'
import { publicTenantCard } from '@/test/fixtures/tenant'
import { availabilityResponse } from '@/test/fixtures/public'

type GeoSuccess = (pos: { coords: { latitude: number; longitude: number } }) => void
type GeoError = (err: { code: number }) => void

function stubGeolocation(getCurrentPosition: (success: GeoSuccess, error: GeoError) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
}

const located = (success: GeoSuccess) =>
  success({ coords: { latitude: -34.5703, longitude: -59.105 } })

/** Búsqueda → `results`; disponibilidad → la fixture (10:00, 20:00 y 21:00 libres). */
function stubApi(results: unknown[]) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () =>
        url.startsWith('/api/public/search')
          ? { results, total: results.length }
          : availabilityResponse({ date: '2026-09-27' }),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <NearbyProvider>{children}</NearbyProvider>
)

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('NearbyProvider', () => {
  it('con permiso: busca por distancia solo online, elige y trae los turnos libres', async () => {
    stubGeolocation(located)
    const fetchMock = stubApi([
      publicTenantCard({ id: 'a', slug: 'a', city: 'Luján', distanceKm: 4.2, coverUrl: '/x.png' }),
      publicTenantCard({ id: 'b', slug: 'b', city: 'Luján', distanceKm: 7.8 }),
    ])

    const { result } = renderHook(() => useNearby(), { wrapper })

    await waitFor(() => {
      const s = result.current.state
      expect(s.status === 'found' && s.complexes[0]?.slots?.length).toBeTruthy()
    })
    const s = result.current.state
    if (s.status !== 'found') throw new Error('esperaba found')
    expect(s.complexes.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.complexes[0]?.slots?.map((x) => x.time)).toEqual(['10:00', '20:00', '21:00'])
    // Las filas muestran solo el próximo libre.
    expect(s.complexes[1]?.slots).toHaveLength(1)
    expect(s.coords).toEqual({ lat: -34.57, lng: -59.1 })
    expect(result.current.nearestCity).toEqual({ city: 'Luján', province: 'CABA' })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/public/search?')
    expect(url).toContain('sort=distance')
    expect(url).toContain('online=1')
    expect(url).toContain('lat=-34.570300')
  })

  it('mientras espera la posición, el estado es locating', () => {
    stubGeolocation(() => {
      /* nunca responde */
    })
    const { result } = renderHook(() => useNearby(), { wrapper })
    expect(result.current.state.status).toBe('locating')
  })

  it('permiso denegado (code 1) → denied, sin llamar a la API', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    const fetchMock = stubApi([])
    const { result } = renderHook(() => useNearby(), { wrapper })
    await waitFor(() => expect(result.current.state.status).toBe('denied'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('navegador sin geolocalización → unsupported', () => {
    const { result } = renderHook(() => useNearby(), { wrapper })
    expect(result.current.state.status).toBe('unsupported')
  })

  it('nada a menos de 40 km → none, y la zona no se sugiere si está a más de 50', async () => {
    stubGeolocation(located)
    stubApi([publicTenantCard({ city: 'Salta', distanceKm: 320 })])
    const { result } = renderHook(() => useNearby(), { wrapper })
    await waitFor(() => expect(result.current.state.status).toBe('none'))
    expect(result.current.nearestCity).toBeNull()
  })

  it('fallo de red → error (no bloqueante)', async () => {
    stubGeolocation(located)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { result } = renderHook(() => useNearby(), { wrapper })
    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })

  it('timeout u otro error de posición (code != 1) → error', async () => {
    stubGeolocation((_success, error) => error({ code: 3 }))
    const { result } = renderHook(() => useNearby(), { wrapper })
    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })
})
