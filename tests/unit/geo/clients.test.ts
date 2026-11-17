import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGeorefAddressUrls,
  parseGeorefAddresses,
  parseGeorefLocation,
  searchGeorefAddresses,
} from '@/modules/geo/georef.client'
import { parsePhotonAddresses, parsePhotonPlaces } from '@/modules/geo/photon.client'
import {
  GEOREF_ADDRESSES,
  GEOREF_EMPTY,
  GEOREF_LOCATION,
  PHOTON_JAUREGUI,
  PHOTON_MITRE_HOUSE,
  PHOTON_MITRE_STREET,
  jsonResponse,
} from './fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('Georef direcciones', () => {
  it('REGRESIÓN: filtra por localidad_censal y nunca manda `localidad=` (Georef lo ignora)', () => {
    const [byName] = buildGeorefAddressUrls({
      street: 'Bartolomé Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
    })
    expect(byName).toContain('localidad_censal=')
    expect(byName).not.toMatch(/[?&]localidad=/)

    const [byId] = buildGeorefAddressUrls({ street: 'Mitre 800', localityId: '06497020' })
    expect(byId).toContain('localidad_censal=06497020')
    expect(byId).not.toMatch(/[?&]localidad=/)
  })

  it('sin id reintenta por departamento, siempre con provincia y sin la localidad en la calle', () => {
    const urls = buildGeorefAddressUrls({
      street: 'Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
    })
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain('departamento=Luj')
    for (const u of urls) {
      expect(u).toContain('provincia=Buenos+Aires')
      expect(new URL(u).searchParams.get('direccion')).toBe('Mitre 800')
    }
  })

  it('con 0 resultados por localidad_censal reintenta con departamento', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(GEOREF_EMPTY))
      .mockResolvedValueOnce(jsonResponse(GEOREF_ADDRESSES))
    vi.stubGlobal('fetch', fetchMock)
    const res = await searchGeorefAddresses({
      street: 'Mitre 800',
      city: 'Luján',
      province: 'Buenos Aires',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(res).toMatchObject({ ok: true })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('departamento=')
  })

  it('parsea la respuesta real: calle en Title Case + altura', () => {
    expect(parseGeorefAddresses(GEOREF_ADDRESSES)).toEqual([
      {
        label: 'Bartolome Mitre 800, Luján, Buenos Aires',
        address: 'Bartolome Mitre 800',
        city: 'Luján',
        province: 'Buenos Aires',
        lat: -34.5680547443743,
        lng: -59.1116388044861,
        source: 'georef',
      },
    ])
  })

  it('la misma dirección repetida con puntos distintos sale una sola vez', () => {
    // Georef devuelve una fila por tramo de calle: "Bartolome Mitre 2064, Luján" llegaba 4 veces.
    const row = (lat: number, lon: number) => ({
      calle: { nombre: 'BARTOLOME MITRE' },
      altura: { valor: 2064 },
      localidad_censal: { nombre: 'Luján' },
      departamento: { nombre: 'Luján' },
      provincia: { nombre: 'Buenos Aires' },
      ubicacion: { lat, lon },
    })
    const parsed = parseGeorefAddresses({
      direcciones: [row(-34.56, -59.11), row(-34.57, -59.12), row(-34.58, -59.13)],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.label).toBe('Bartolome Mitre 2064, Luján, Buenos Aires')
  })

  it('un JSON roto o sin resultados da []', () => {
    expect(parseGeorefAddresses(null)).toEqual([])
    expect(parseGeorefAddresses({ direcciones: [{ calle: {} }] })).toEqual([])
    expect(parseGeorefAddresses(GEOREF_EMPTY)).toEqual([])
  })

  it('un 500 es ok:false, no "sin resultados"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    expect(await searchGeorefAddresses({ street: 'Mitre 800', localityId: '06497020' })).toEqual({
      ok: false,
    })
  })

  it('parsea /ubicacion', () => {
    expect(parseGeorefLocation(GEOREF_LOCATION)).toEqual({
      province: 'Buenos Aires',
      department: 'Luján',
      departmentId: '06497',
      municipality: 'Luján',
    })
    expect(parseGeorefLocation({ ubicacion: { provincia: { nombre: null } } })).toBeNull()
  })
})

describe('Photon', () => {
  it('Jáuregui (village, Partido de Luján) se parsea y se descarta el de Uruguay', () => {
    expect(parsePhotonPlaces(PHOTON_JAUREGUI)).toEqual([
      {
        city: 'Jáuregui',
        province: 'Buenos Aires',
        department: 'Luján',
        lat: -34.6001591,
        lng: -59.1741206,
        source: 'osm',
      },
    ])
  })

  it('dirección con altura: saca el prefijo numérico de la calle', () => {
    expect(parsePhotonAddresses(PHOTON_MITRE_HOUSE)[0]).toMatchObject({
      address: 'Bartolomé Mitre 800',
      label: 'Bartolomé Mitre 800, Luján, Buenos Aires',
      source: 'osm',
    })
  })

  it('calle sin altura: usa la que escribió el usuario', () => {
    expect(parsePhotonAddresses(PHOTON_MITRE_STREET, '800')[0]).toMatchObject({
      address: 'Bartolomé Mitre 800',
      lat: -34.568,
    })
    expect(parsePhotonAddresses(PHOTON_MITRE_STREET)[0]?.address).toBe('Bartolomé Mitre')
  })

  it('basura da []', () => {
    expect(parsePhotonPlaces({})).toEqual([])
    // Una calle no es una localidad: el reverse de un punto no puede devolverla como tal.
    expect(parsePhotonPlaces(PHOTON_MITRE_STREET)).toEqual([])
    expect(parsePhotonAddresses('x')).toEqual([])
  })
})
