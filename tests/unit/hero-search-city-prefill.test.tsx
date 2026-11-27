// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { parseZona, wasZonaApplied, ZONA_STORAGE_KEY } from '@/lib/zona-storage'
import type { CityCount } from '@/modules/tenants/search.service'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

// La zona por IP cachea su promesa a nivel de módulo: se mockea el hook y cada test decide qué llega.
let ipZona: { city: string; province: string } | null = null
const ipZonaMock = vi.fn((enabled: boolean) => (enabled ? ipZona : null))
vi.mock('@/hooks/use-ip-zona', () => ({ useIpZona: (enabled: boolean) => ipZonaMock(enabled) }))

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

/** `fetch` de la app: `/api/public/geo/reverse` y `/api/public/geo/localidades`. */
function stubGeoFetch(
  reverse: { city: string; province: string; lat: number; lng: number } | null,
  localities: Array<Record<string, unknown>> = [],
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('/geo/localidades') ? { results: localities } : { result: reverse },
    })),
  )
}

/** Los campos del form (cerrado). Con una hoja abierta quedan aria-hidden: leerlos antes de abrir. */
const localidadField = () => screen.getByRole('button', { name: /^Zona:/ })
const canchaField = () => screen.getByRole('button', { name: /^Cancha:/ })
const localidadLabel = () => localidadField().getAttribute('aria-label')
const openLocalidad = () => fireEvent.click(localidadField())
const searchForm = () =>
  screen.getByRole('form', { name: 'Buscar canchas de fútbol', hidden: true })
const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement

const locateButton = () => screen.queryByRole('button', { name: 'Usar mi ubicación actual' })

function saveZonaInStorage(zona: object) {
  localStorage.setItem(ZONA_STORAGE_KEY, JSON.stringify(zona))
}

const CORDOBA_NEARBY = { city: 'Córdoba', province: 'Córdoba', lat: -31.4167, lng: -64.1833 }
/** `getCurrentPosition` que responde al toque desde Córdoba. */
const atCordoba = (success: GeoSuccess) =>
  success({ coords: { latitude: -31.42, longitude: -64.18 } })

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  stubPermission('prompt')
  ipZona = null
  ipZonaMock.mockClear()
})

afterEach(() => {
  // La zona que guarda un test no puede quedar para el archivo que siga en el mismo worker.
  localStorage.clear()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  pushMock.mockReset()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
})

describe('HeroSearch — localidad desde la ubicación', () => {
  it('"Usar mi ubicación actual" pre-llena la ciudad, la deja guardada y el submit navega con city+province+coordenadas', async () => {
    stubGeolocation(atCordoba)
    stubGeoFetch(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)
    expect(localidadLabel()).toBe('Zona: ¿Dónde?. Cambiar')
    openLocalidad()
    fireEvent.click(locateButton()!)

    await waitFor(() =>
      expect(screen.getByText('Tu zona guardada. Cambiala cuando quieras.')).toBeTruthy(),
    )
    expect(radio(/Córdoba/).checked).toBe(true)
    expect(locateButton()).toBeNull()
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Córdoba')

    fireEvent.submit(searchForm())
    expect(pushMock).toHaveBeenCalledTimes(1)
    const url = String(pushMock.mock.calls[0]?.[0])
    expect(url).toContain('/explorar?')
    expect(url).toContain(`city=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain(`province=${encodeURIComponent('Córdoba')}`)
    expect(url).toContain('lat=-31.42')
    expect(url).toContain('lng=-64.18')
  })

  it('una localidad SIN complejos se muestra en el campo y viaja a /explorar con sus coordenadas', async () => {
    stubGeolocation(atCordoba)
    stubGeoFetch({ city: 'Mercedes', province: 'Buenos Aires', lat: -34.65, lng: -59.43 })

    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    fireEvent.click(locateButton()!)

    await waitFor(() =>
      expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Mercedes'),
    )
    fireEvent.submit(searchForm())
    const url = new URL(String(pushMock.mock.calls[0]?.[0]), 'http://x')
    expect(url.searchParams.get('city')).toBe('Mercedes')
    expect(url.searchParams.get('province')).toBe('Buenos Aires')
    expect(url.searchParams.get('lat')).toBe('-34.65')
    expect(url.searchParams.get('lng')).toBe('-59.43')
  })

  it('NO pide la ubicación al cargar (era el cartel de cada visita): espera al botón', async () => {
    const geo = stubGeolocation(atCordoba)
    stubGeoFetch(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)
    await act(async () => {})

    expect(geo).not.toHaveBeenCalled()
    expect(localidadLabel()).toBe('Zona: ¿Dónde?. Cambiar')
    openLocalidad()
    expect(locateButton()).toBeTruthy()
  })

  it('con la zona ya guardada: campo pre-llenado, sin botón y sin tocar geolocation', async () => {
    saveZonaInStorage({ city: 'Rosario', province: 'Santa Fe' })
    stubPermission('granted')
    const geo = stubGeolocation(atCordoba)

    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(localidadLabel()).toBe('Zona: Rosario. Cambiar'))
    await act(async () => {})
    openLocalidad()
    expect(screen.getByText('Tu zona guardada. Cambiala cuando quieras.')).toBeTruthy()
    expect(locateButton()).toBeNull()
    expect(geo).not.toHaveBeenCalled()
  })

  it('con el permiso ya concedido y sin zona, la resuelve sola (no hay cartel que mostrar)', async () => {
    stubPermission('granted')
    stubGeolocation(atCordoba)
    stubGeoFetch(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(localidadLabel()).toBe('Zona: Córdoba. Cambiar'))
  })

  it('permiso denegado al tocar el botón → mensaje sutil, campo vacío y el form sigue funcionando', async () => {
    stubGeolocation((_success, error) => error({ code: 1 }))
    render(<HeroSearch cities={CITIES} />)

    openLocalidad()
    fireEvent.click(locateButton()!)

    await waitFor(() => expect(screen.getByText(/bloqueado el permiso de ubicación/i)).toBeTruthy())
    expect(locateButton()).toBeNull()
    expect(radio('Todas las zonas').checked).toBe(true)

    fireEvent.submit(searchForm())
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
  })

  it('permiso ya bloqueado en el navegador: sin botón y con el mensaje, sin pedir nada', async () => {
    stubPermission('denied')
    const geo = stubGeolocation(atCordoba)

    render(<HeroSearch cities={CITIES} />)
    await act(async () => {})
    openLocalidad()

    await waitFor(() => expect(screen.getByText(/bloqueado el permiso de ubicación/i)).toBeTruthy())
    expect(locateButton()).toBeNull()
    expect(geo).not.toHaveBeenCalled()
  })
})

describe('HeroSearch — elegir la localidad a mano', () => {
  it('elegir una ciudad la guarda como zona y reaparece al volver a la home', async () => {
    stubGeolocation(atCordoba)
    const { unmount } = render(<HeroSearch cities={CITIES} />)

    openLocalidad()
    fireEvent.click(radio(/Rosario/))
    expect(localidadLabel()).toBe('Zona: Rosario. Cambiar')
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))).toEqual({
      city: 'Rosario',
      province: 'Santa Fe',
    })

    unmount()
    render(<HeroSearch cities={CITIES} />)
    await waitFor(() => expect(localidadLabel()).toBe('Zona: Rosario. Cambiar'))
  })

  it('"Todas las zonas" vale para esta búsqueda: no borra la zona y /explorar no se la impone', async () => {
    saveZonaInStorage({ city: 'Rosario', province: 'Santa Fe' })
    render(<HeroSearch cities={CITIES} />)
    await waitFor(() => expect(localidadLabel()).toBe('Zona: Rosario. Cambiar'))

    openLocalidad()
    fireEvent.click(radio('Todas las zonas'))
    expect(localidadLabel()).toBe('Zona: Todas. Cambiar')
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Rosario')

    fireEvent.submit(searchForm())
    expect(String(pushMock.mock.calls[0]?.[0])).toBe('/explorar')
    expect(wasZonaApplied()).toBe(true)
  })

  it('abrir la hoja congela el valor: la ubicación que llega tarde no se lo cambia', async () => {
    stubPermission('granted')
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubGeoFetch(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)

    // El jugador abre la hoja (está por elegir) antes de que llegue la posición.
    openLocalidad()
    await waitFor(() => expect(fireGeo).not.toBeNull())

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(radio('Todas las zonas').checked).toBe(true)
    expect(radio(/Córdoba/).checked).toBe(false)
  })

  it('elige a mano MIENTRAS la ubicación está en camino: la que llega tarde no se guarda', async () => {
    let fireGeo: GeoSuccess | null = null
    stubGeolocation((success) => {
      fireGeo = success
    })
    stubGeoFetch(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    fireEvent.click(locateButton()!)
    await waitFor(() => expect(fireGeo).not.toBeNull())

    fireEvent.click(radio(/Rosario/))

    await act(async () => {
      fireGeo?.({ coords: { latitude: -31.42, longitude: -64.18 } })
    })
    await act(async () => {})

    expect(localidadLabel()).toBe('Zona: Rosario. Cambiar')
    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))?.city).toBe('Rosario')
  })

  it('si el usuario ya eligió una ciudad, no se dispara la detección ni se la pisa', async () => {
    stubPermission('granted')
    const geo = stubGeolocation(atCordoba)
    stubGeoFetch(CORDOBA_NEARBY)

    render(<HeroSearch cities={CITIES} />)

    // Elige a mano antes de que termine la consulta de permisos: queda guardada como zona.
    openLocalidad()
    fireEvent.click(radio(/Rosario/))
    expect(localidadLabel()).toBe('Zona: Rosario. Cambiar')

    await act(async () => {})
    await act(async () => {})

    expect(geo).not.toHaveBeenCalled()
    expect(localidadLabel()).toBe('Zona: Rosario. Cambiar')
  })

  it('al escribir una localidad sin complejos aparece en "Otras zonas" y se puede elegir', async () => {
    stubGeoFetch(null, [
      { city: 'Mercedes', province: 'Buenos Aires', lat: -34.65, lng: -59.43, source: 'dataset' },
      { city: 'Córdoba', province: 'Córdoba', lat: -31.41, lng: -64.18, source: 'dataset' },
    ])
    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zona o ciudad' }), {
      target: { value: 'mercedes' },
    })

    const mercedes = await screen.findByRole('radio', { name: /Mercedes/ })
    expect(screen.getByText('Otras zonas')).toBeTruthy()
    expect(screen.getByText(/Todavía sin complejos/)).toBeTruthy()
    // Córdoba ya figura entre las que tienen complejos: no se repite.
    expect(screen.queryByRole('radio', { name: /Córdoba/ })).toBeNull()

    fireEvent.click(mercedes)
    expect(localidadLabel()).toBe('Zona: Mercedes. Cambiar')
    fireEvent.submit(searchForm())
    const url = new URL(String(pushMock.mock.calls[0]?.[0]), 'http://x')
    expect(url.searchParams.get('city')).toBe('Mercedes')
    expect(url.searchParams.get('lat')).toBe('-34.65')
  })

  it('sin resultados en ninguna lista dice que no la encontró (nunca un callejón mudo)', async () => {
    stubGeoFetch(null, [])
    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zona o ciudad' }), {
      target: { value: 'zzzz' },
    })
    expect(await screen.findByText('No encontramos esa zona.')).toBeTruthy()
  })

  it('el buscador de la hoja filtra las localidades por lo que se escribe', () => {
    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zona o ciudad' }), {
      target: { value: 'rosa' },
    })
    expect(screen.queryByRole('radio', { name: /Córdoba/ })).toBeNull()
    expect(radio(/Rosario/)).toBeTruthy()
  })
})

describe('HeroSearch — zona por la conexión (IP)', () => {
  it('sin zona guardada, la zona por IP se muestra en el campo con su aviso', async () => {
    ipZona = { city: 'Rosario', province: 'Santa Fe' }
    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(localidadLabel()).toBe('Zona: Rosario. Cambiar'))
    openLocalidad()
    expect(
      screen.getByText(/Te mostramos Rosario por la zona desde donde te conectás/),
    ).toBeTruthy()
  })

  it('la zona por IP NO se guarda en el dispositivo', async () => {
    ipZona = { city: 'Rosario', province: 'Santa Fe' }
    render(<HeroSearch cities={CITIES} />)
    await waitFor(() => expect(localidadLabel()).toBe('Zona: Rosario. Cambiar'))
    openLocalidad()
    await act(async () => {})

    expect(localStorage.getItem(ZONA_STORAGE_KEY)).toBeNull()
  })

  it('tocar la zona por IP, que ya viene marcada, la confirma: queda guardada y cierra la hoja', async () => {
    ipZona = { city: 'Rosario', province: 'Santa Fe' }
    render(<HeroSearch cities={CITIES} />)
    await waitFor(() => expect(localidadLabel()).toBe('Zona: Rosario. Cambiar'))
    openLocalidad()
    expect(radio(/^Rosario/).checked).toBe(true)

    fireEvent.click(radio(/^Rosario/))

    expect(parseZona(localStorage.getItem(ZONA_STORAGE_KEY))).toMatchObject({
      city: 'Rosario',
      province: 'Santa Fe',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('con zona guardada no se pide la IP y gana la guardada', async () => {
    saveZonaInStorage({ city: 'Córdoba', province: 'Córdoba' })
    ipZona = { city: 'Rosario', province: 'Santa Fe' }
    render(<HeroSearch cities={CITIES} />)

    await waitFor(() => expect(localidadLabel()).toBe('Zona: Córdoba. Cambiar'))
    await act(async () => {})
    expect(ipZonaMock.mock.calls.some(([enabled]) => enabled)).toBe(false)
  })
})

describe('HeroSearch — resto del formulario', () => {
  it('sin soporte de geolocalización no muestra el botón ni mensajes y no rompe', () => {
    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    expect(locateButton()).toBeNull()
    expect(screen.queryByText(/ubicación/i)).toBeNull()
  })

  it('el campo de búsqueda de la hoja no baja de 16 px (iOS zoomea al enfocar)', () => {
    render(<HeroSearch cities={CITIES} />)
    openLocalidad()
    const input = screen.getByRole('searchbox', { name: 'Zona o ciudad' })
    expect(input.className).toContain('text-base')
    expect(input.className).not.toMatch(/(^|\s)text-sm(\s|$)/)
  })

  it('no hay campo de club: el club se busca en /explorar', () => {
    render(<HeroSearch cities={CITIES} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByPlaceholderText('¿Qué club buscás?')).toBeNull()
  })

  it('buscar con tamaños elegidos navega con formats y sin date ni time', () => {
    saveZonaInStorage({ city: 'Rosario', province: 'Santa Fe' })
    render(<HeroSearch cities={CITIES} />)
    fireEvent.click(canchaField())
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Fútbol 7' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Fútbol 5' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Buscar canchas' }))

    const url = new URL(String(pushMock.mock.calls[0]?.[0]), 'http://x')
    expect(url.pathname).toBe('/explorar')
    expect(url.searchParams.get('formats')).toBe('5,7')
    expect(url.searchParams.has('date')).toBe(false)
    expect(url.searchParams.has('time')).toBe(false)
  })
})
