// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { parseZona, wasZonaApplied, ZONA_STORAGE_KEY } from '@/lib/zona-storage'
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
  const spy = vi.fn(getCurrentPosition)
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: spy },
  })
  return spy
}

/** `null` = el navegador no tiene Permissions API. */
function stubPermission(state: PermissionState | null) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: state === null ? undefined : { query: () => Promise.resolve({ state }) },
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

const locateButton = () => screen.queryByRole('button', { name: 'Usar mi ubicación' })

function saveZonaInStorage(zona: object) {
  localStorage.setItem(ZONA_STORAGE_KEY, JSON.stringify(zona))
}

const CORDOBA_NEARBY = [{ city: 'Córdoba', province: 'Córdoba', distanceKm: 3.2 }]
/** `getCurrentPosition` que responde al toque desde Córdoba. */
const atCordoba = (success: GeoSuccess) =>
  success({ coords: { latitude: -31.42, longitude: -64.18 } })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  stubPermission('prompt')
})

afterEach(() => {
  vi.unstubAllGlobals()
  pushMock.mockReset()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

describe('HeroSearch — localidad desde la ubicación', () => {
  it('"Usar mi ubicación" pre-llena la ciudad, la deja guardada y el submit navega con city+province', async () => {
    stubGeolocation(atCordoba)
    stubFetchNearest(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)
    expect(cityInput().value).toBe('')
    fireEvent.click(locateButton()!)

    await waitFor(() => expect(cityInput().value).toBe('Córdoba, Córdoba'))
    expect(screen.getByText('Tu zona guardada. Cambiala cuando quieras.')).toBeTruthy()
    expect(locateButton()).toBeNull()
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Córdoba')

    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    expect(pushMock).toHaveBeenCalledTimes(1)
    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).toContain('/explorar?')
    expect(url).toContain(`city=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain(`province=${encodeURIComponent('Córdoba')}`)
  })

  it('NO pide la ubicación al cargar (era el cartel de cada visita): espera al botón', async () => {
    const geo = stubGeolocation(atCordoba)
    stubFetchNearest(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)
    await act(async () => {})

    expect(geo).not.toHaveBeenCalled()
    expect(cityInput().value).toBe('')
    expect(locateButton()).toBeTruthy()
  })

  it('con la zona ya guardada: campo pre-llenado, sin botón y sin tocar geolocation', async () => {
    saveZonaInStorage({ city: 'Rosario', province: 'Santa Fe' })
    stubPermission('granted')
    const geo = stubGeolocation(atCordoba)

    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(cityInput().value).toBe('Rosario, Santa Fe'))
    await act(async () => {})
    expect(screen.getByText('Tu zona guardada. Cambiala cuando quieras.')).toBeTruthy()
    expect(locateButton()).toBeNull()
    expect(geo).not.toHaveBeenCalled()
  })

  it('con el permiso ya concedido y sin zona, la resuelve sola (no hay cartel que mostrar)', async () => {
    stubPermission('granted')
    stubGeolocation(atCordoba)
    stubFetchNearest(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(cityInput().value).toBe('Córdoba, Córdoba'))
  })

  it('permiso denegado al tocar el botón → mensaje sutil, campo vacío y el form sigue funcionando', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    render(<HeroSearch cities={CITIES} />)

    fireEvent.click(locateButton()!)

    await waitFor(() => expect(screen.getByText(/no pudimos acceder a tu ubicación/i)).toBeTruthy())
    expect(cityInput().value).toBe('')
    expect(locateButton()).toBeNull()

    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
  })

  it('permiso ya bloqueado en el navegador: sin botón y con el mensaje, sin pedir nada', async () => {
    stubPermission('denied')
    const geo = stubGeolocation(atCordoba)

    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(screen.getByText(/no pudimos acceder a tu ubicación/i)).toBeTruthy())
    expect(locateButton()).toBeNull()
    expect(geo).not.toHaveBeenCalled()
  })
})

describe('HeroSearch — elegir la localidad a mano', () => {
  it('elegir una ciudad la guarda como zona y reaparece al volver a la home', async () => {
    stubGeolocation(atCordoba)
    const { unmount } = render(<HeroSearch cities={CITIES} />)

    fireEvent.click(cityInput())
    fireEvent.mouseDown(screen.getByRole('option', { name: /Rosario/ }))
    expect(cityInput().value).toBe('Rosario, Santa Fe')
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))).toEqual({
      city: 'Rosario',
      province: 'Santa Fe',
    })

    unmount()
    render(<HeroSearch cities={CITIES} />)
    await waitFor(() => expect(cityInput().value).toBe('Rosario, Santa Fe'))
  })

  it('"Todas las ciudades" vale para esta búsqueda: no borra la zona y /explorar no se la impone', async () => {
    saveZonaInStorage({ city: 'Rosario', province: 'Santa Fe' })
    render(<HeroSearch cities={CITIES} />)
    await waitFor(() => expect(cityInput().value).toBe('Rosario, Santa Fe'))

    fireEvent.click(cityInput())
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Todas las ciudades' }))
    expect(cityInput().value).toBe('')
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Rosario')

    fireEvent.submit(screen.getByRole('form', { name: 'Buscar canchas de fútbol' }))
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
    expect(wasZonaApplied()).toBe(true)
  })

  it('si el usuario ya está en el campo, la ubicación que llega tarde no le cambia el valor', async () => {
    stubPermission('granted')
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubFetchNearest(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)

    // El usuario pone el foco (está por escribir) antes de que llegue la posición.
    fireEvent.focus(cityInput())
    await waitFor(() => expect(fireGeo).not.toBeNull())

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(cityInput().value).toBe('')
  })

  it('elige a mano MIENTRAS la ubicación está en camino: la que llega tarde no se guarda', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubFetchNearest(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)
    fireEvent.click(locateButton()!)
    await waitFor(() => expect(fireGeo).not.toBeNull())

    fireEvent.click(cityInput())
    fireEvent.mouseDown(screen.getByRole('option', { name: /Rosario/ }))

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(cityInput().value).toBe('Rosario, Santa Fe')
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Rosario')
  })

  it('si el usuario ya eligió una ciudad, no se dispara la detección ni se la pisa', async () => {
    stubPermission('granted')
    const geo = stubGeolocation(atCordoba)
    stubFetchNearest(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)

    // Elige a mano antes de que termine la consulta de permisos: queda guardada como zona.
    fireEvent.click(cityInput())
    fireEvent.mouseDown(screen.getByRole('option', { name: /Rosario/ }))
    expect(cityInput().value).toBe('Rosario, Santa Fe')

    await act(async () => {})
    await act(async () => {})

    expect(geo).not.toHaveBeenCalled()
    expect(cityInput().value).toBe('Rosario, Santa Fe')
  })
})

describe('HeroSearch — resto del formulario', () => {
  it('sin soporte de geolocalización no muestra el botón ni mensajes y no rompe', () => {
    render(<HeroSearch cities={CITIES} />)
    expect(cityInput().value).toBe('')
    expect(locateButton()).toBeNull()
    expect(screen.queryByText(/ubicación/i)).toBeNull()
  })

  it('el valor de Localidad no baja de 16 px en ningún ancho (el combobox trae `md:text-sm`)', () => {
    render(<HeroSearch cities={CITIES} />)
    // tailwind-merge deja sobrevivir el `md:text-sm` del combobox si fieldClass no lo pisa:
    // a 14 px desde `md` iOS zoomea al enfocar.
    expect(cityInput().className).toContain('md:text-base')
    expect(cityInput().className).not.toContain('md:text-sm')
  })

  it('no hay campo de club: el club se busca en /explorar', () => {
    render(<HeroSearch cities={CITIES} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByPlaceholderText('¿Qué club buscás?')).toBeNull()
  })
})
