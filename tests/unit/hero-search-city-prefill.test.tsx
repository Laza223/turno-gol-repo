// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CityCount } from '@/modules/tenants/search.service'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

import HeroSearch from '@/app/home/HeroSearch'
import { NearbyProvider } from '@/app/home/nearby-context'

const CITIES: CityCount[] = [
  { city: 'Córdoba', province: 'Córdoba', count: 8 },
  { city: 'Rosario', province: 'Santa Fe', count: 5 },
]

type GeoSuccess = (pos: { coords: { latitude: number; longitude: number } }) => void
type GeoError = (err: { code: number }) => void

function stubGeolocation(getCurrentPosition: (success: GeoSuccess, error: GeoError) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
}

/** Búsqueda → el complejo más cercano; disponibilidad → sin turnos (no importa acá). */
function stubApi(results: Array<{ city: string; province: string; distanceKm: number }>) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: async () =>
        url.startsWith('/api/public/search')
          ? { results, total: results.length }
          : { date: '2026-09-27', courts: [] },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderSearch() {
  return render(
    <NearbyProvider>
      <HeroSearch cities={CITIES} />
    </NearbyProvider>,
  )
}

function cityInput(): HTMLInputElement {
  return screen.getByRole('combobox', { name: 'Zona' }) as HTMLInputElement
}

const cordoba = { city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }

afterEach(() => {
  vi.unstubAllGlobals()
  pushMock.mockReset()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('HeroSearch — zona sugerida por la ubicación del hero', () => {
  it('sugiere la localidad del complejo más cercano y el submit navega con city+province', async () => {
    stubGeolocation((success) => success({ coords: { latitude: -31.42, longitude: -64.18 } }))
    stubApi([cordoba])

    renderSearch()

    await waitFor(() => expect(cityInput().value).toBe('Córdoba, Córdoba'))
    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).toContain('/explorar?')
    expect(url).toContain(`city=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain(`province=${encodeURIComponent('Córdoba')}`)
    // Hoy no viaja: /explorar ya arranca en hoy.
    expect(url).not.toContain('date=')
  })

  it('permiso denegado → campo vacío y el form sigue funcionando', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    renderSearch()
    await act(async () => {})
    expect(cityInput().value).toBe('')
    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
  })

  it('si el usuario ya eligió una zona, la detección tardía no la pisa', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    const fetchMock = stubApi([cordoba])

    renderSearch()

    const input = cityInput()
    fireEvent.click(input)
    fireEvent.mouseDown(screen.getByRole('option', { name: /Rosario/ }))
    expect(input.value).toBe('Rosario, Santa Fe')

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})

    expect(cityInput().value).toBe('Rosario, Santa Fe')
  })

  it('si el usuario enfocó la zona, la detección tardía no la llena', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubApi([cordoba])

    renderSearch()
    fireEvent.focus(cityInput())

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(cityInput().value).toBe('')
  })

  it('si el foco llegó antes de hidratar, tipear alcanza para que no la pise', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubApi([cordoba])

    renderSearch()
    // Sin evento de focus (pasó antes de hidratar): solo la tecla.
    fireEvent.input(cityInput(), { target: { value: 'Ro' } })

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(cityInput().value).not.toBe('Córdoba, Córdoba')
  })

  it('sin soporte de geolocalización no rompe y la zona queda vacía', () => {
    renderSearch()
    expect(cityInput().value).toBe('')
  })
})
