// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CityCount } from '@/modules/tenants/search.service'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

import HeroSearch from '@/components/site/HeroSearch'

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

function stubFetchNearest(results: Array<{ city: string; province: string; distanceKm: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results, total: results.length }) }),
  )
}

function cityInput(): HTMLInputElement {
  return screen.getByRole('combobox', { name: 'Localidad' }) as HTMLInputElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  pushMock.mockReset()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

describe('HeroSearch — pre-llenado por geolocalización', () => {
  it('detecta la ubicación, pre-llena la ciudad y el submit navega con city+province', async () => {
    stubGeolocation((success) => success({ coords: { latitude: -31.42, longitude: -64.18 } }))
    stubFetchNearest([{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }])

    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(cityInput().value).toBe('Córdoba, Córdoba'))
    expect(screen.getByText(/según tu ubicación/i)).toBeTruthy()

    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    expect(pushMock).toHaveBeenCalledTimes(1)
    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).toContain('/explorar?')
    expect(url).toContain(`city=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain(`province=${encodeURIComponent('Córdoba')}`)
  })

  it('permiso denegado → mensaje sutil, campo vacío y el form sigue funcionando', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    render(<HeroSearch cities={CITIES} />)

    await waitFor(() =>
      expect(screen.getByText(/no pudimos acceder a tu ubicación/i)).toBeTruthy(),
    )
    expect(cityInput().value).toBe('')

    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
  })

  it('si el usuario ya eligió una ciudad, la detección tardía no la pisa', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }],
        total: 1,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<HeroSearch cities={CITIES} />)

    // El usuario elige Rosario antes de que la geolocalización responda.
    const input = cityInput()
    fireEvent.click(input)
    fireEvent.mouseDown(screen.getByRole('option', { name: /Rosario/ }))
    expect(input.value).toBe('Rosario, Santa Fe')

    // Recién ahora "llega" la posición del dispositivo.
    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})

    expect(cityInput().value).toBe('Rosario, Santa Fe')
  })

  it('si el usuario enfocó el campo de localidad, la detección tardía no pre-llena', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubFetchNearest([{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }])

    render(<HeroSearch cities={CITIES} />)

    // El usuario pone el foco en el campo (está por escribir) antes de que llegue la posición.
    fireEvent.focus(cityInput())

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(cityInput().value).toBe('')
  })

  it('si el foco quedó en el campo antes de la hidratación (sin evento React), tampoco pisa', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubFetchNearest([{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }])

    render(<HeroSearch cities={CITIES} />)

    // Simula foco pre-hidratación: activeElement apunta al input pero el evento
    // de focus nunca pasó por React (onFocusCapture no se enteró).
    const input = cityInput()
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => input })
    try {
      await act(async () => {
        fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
      })
      await act(async () => {})
      expect(cityInput().value).toBe('')
    } finally {
      Reflect.deleteProperty(document, 'activeElement')
    }
  })

  it('sin soporte de geolocalización no muestra mensajes ni rompe', () => {
    render(<HeroSearch cities={CITIES} />)
    expect(cityInput().value).toBe('')
    expect(screen.queryByText(/ubicación/i)).toBeNull()
  })
})
