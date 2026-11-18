import { afterEach, describe, expect, it, vi } from 'vitest'
import { findAddresses, findLocalities, locate } from '@/modules/geo/geo.service'
import {
  GEOREF_ADDRESSES,
  GEOREF_EMPTY,
  GEOREF_LOCATION,
  PHOTON_JAUREGUI,
  PHOTON_MITRE_STREET,
  jsonResponse,
} from './fixtures'

afterEach(() => vi.unstubAllGlobals())

const isPhoton = (url: string) => url.includes('photon.komoot.io')

// Enruta por host: cada test define qué responde Georef y qué Photon.
function stubFetch(handlers: { georef?: () => Response; photon?: () => Response }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const handler = isPhoton(url) ? handlers.photon : handlers.georef
    if (!handler) throw new Error(`fetch inesperado: ${new URL(url).host}`)
    return handler()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const hosts = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(([u]) => new URL(String(u)).host)

describe('findLocalities', () => {
  it('con resultados suficientes en el dataset no sale a internet', async () => {
    const fetchMock = stubFetch({})
    const { results } = await findLocalities('mercedes')
    expect(results.length).toBeGreaterThanOrEqual(3)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('completa con Photon cuando el dataset trae poco (Jáuregui)', async () => {
    stubFetch({ photon: () => jsonResponse(PHOTON_JAUREGUI) })
    const { results, degraded } = await findLocalities('jauregui')
    expect(degraded).toBeUndefined()
    expect(results).toContainEqual(
      expect.objectContaining({ city: 'Jáuregui', province: 'Buenos Aires', source: 'osm' }),
    )
  })

  it('no duplica lo que el dataset ya trae', async () => {
    stubFetch({
      photon: () =>
        jsonResponse({
          features: [
            {
              properties: { name: 'Luján', state: 'Buenos Aires', countrycode: 'AR' },
              geometry: { coordinates: [-59.1, -34.5] },
            },
          ],
        }),
    })
    const { results } = await findLocalities('lujan buenos aires')
    expect(results.filter((l) => l.city === 'Luján' && l.province === 'Buenos Aires')).toHaveLength(
      1,
    )
  })

  it('si Photon falla y no hay nada, degraded', async () => {
    stubFetch({ photon: () => jsonResponse({}, 503) })
    expect(await findLocalities('zzzzqx')).toEqual({ results: [], degraded: true })
  })
})

describe('findAddresses', () => {
  const input = { street: 'Mitre 800', city: 'Luján', province: 'Buenos Aires' }

  it('con resultados de Georef no llama a Photon', async () => {
    const fetchMock = stubFetch({ georef: () => jsonResponse(GEOREF_ADDRESSES) })
    const { results } = await findAddresses(input)
    expect(results[0]?.source).toBe('georef')
    expect(hosts(fetchMock)).not.toContain('photon.komoot.io')
  })

  it('con 0 de Georef cae a Photon y usa la altura que escribió el usuario', async () => {
    stubFetch({
      georef: () => jsonResponse(GEOREF_EMPTY),
      photon: () => jsonResponse(PHOTON_MITRE_STREET),
    })
    const res = await findAddresses(input)
    expect(res.degraded).toBeUndefined()
    expect(res.results[0]).toMatchObject({ address: 'Bartolomé Mitre 800', source: 'osm' })
  })

  it('de OSM descarta candidatos de otra localidad de la misma provincia', async () => {
    stubFetch({
      georef: () => jsonResponse(GEOREF_EMPTY),
      photon: () => jsonResponse(PHOTON_MITRE_STREET),
    })
    const res = await findAddresses({ ...input, city: 'Mercedes' })
    expect(res.results).toEqual([])
  })

  it('0 resultados normales no es degraded', async () => {
    stubFetch({
      georef: () => jsonResponse(GEOREF_EMPTY),
      photon: () => jsonResponse({ features: [] }),
    })
    expect(await findAddresses(input)).toEqual({ results: [] })
  })

  it('degraded solo si fallaron todas las fuentes', async () => {
    stubFetch({ georef: () => jsonResponse({}, 500), photon: () => jsonResponse({}, 500) })
    expect(await findAddresses(input)).toEqual({ results: [], degraded: true })

    stubFetch({
      georef: () => jsonResponse({}, 500),
      photon: () => jsonResponse(PHOTON_MITRE_STREET),
    })
    const res = await findAddresses(input)
    expect(res.degraded).toBeUndefined()
    expect(res.results).toHaveLength(1)
  })
})

describe('locate', () => {
  it('locality: con OpenStreetMap caído queda la localidad del dataset, sin calle', async () => {
    const fetchMock = stubFetch({
      georef: () => jsonResponse(GEOREF_LOCATION),
      photon: () => jsonResponse({}, 500),
    })
    const res = await locate(-34.5663, -59.1147, 'locality')
    expect(res.result).toMatchObject({ city: 'Luján', province: 'Buenos Aires' })
    expect(res.result?.address).toBeUndefined()
    expect(hosts(fetchMock).sort()).toEqual(['apis.datos.gob.ar', 'photon.komoot.io'])
  })

  // Jáuregui no está en el dataset: lo más cerca es Villa Flandria Sur, el barrio de al lado.
  const JAUREGUI = [-34.6001, -59.1741] as const

  it('locality: OpenStreetMap dice el pueblo (Jáuregui) y no se pide la calle', async () => {
    const fetchMock = stubFetch({
      georef: () => jsonResponse(GEOREF_LOCATION),
      photon: () => jsonResponse(PHOTON_JAUREGUI),
    })
    const res = await locate(...JAUREGUI, 'locality')
    expect(res.result).toMatchObject({ city: 'Jáuregui', province: 'Buenos Aires' })
    expect(res.result?.address).toBeUndefined()
    expect(hosts(fetchMock).sort()).toEqual(['apis.datos.gob.ar', 'photon.komoot.io'])
    const photonUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes('photon'))
    expect(photonUrl).toContain('layer=city')
  })

  it('locality: OpenStreetMap no pisa a Georef si discrepan en provincia', async () => {
    const cordoba = {
      ...PHOTON_JAUREGUI,
      features: PHOTON_JAUREGUI.features.map((f) => ({
        ...f,
        properties: { ...f.properties, state: 'Córdoba' },
      })),
    }
    stubFetch({
      georef: () => jsonResponse(GEOREF_LOCATION),
      photon: () => jsonResponse(cordoba),
    })
    const res = await locate(...JAUREGUI, 'locality')
    expect(res.result).toMatchObject({ province: 'Buenos Aires' })
    expect(res.result?.city).not.toBe('Jáuregui')
  })

  it('locality: con OpenStreetMap caído queda la localidad del dataset más cercana', async () => {
    stubFetch({ georef: () => jsonResponse(GEOREF_LOCATION), photon: () => jsonResponse({}, 500) })
    expect((await locate(...JAUREGUI, 'locality')).result).toMatchObject({
      city: 'Villa Flandria Sur',
      province: 'Buenos Aires',
    })
  })

  it('address: suma la calle de Photon; si Photon falla igual devuelve la localidad', async () => {
    stubFetch({
      georef: () => jsonResponse(GEOREF_LOCATION),
      photon: () => jsonResponse(PHOTON_MITRE_STREET),
    })
    expect((await locate(-34.5663, -59.1147, 'address')).result?.address).toBe('Bartolomé Mitre')

    stubFetch({ georef: () => jsonResponse(GEOREF_LOCATION), photon: () => jsonResponse({}, 500) })
    expect((await locate(-34.5663, -59.1147, 'address')).result).toMatchObject({ city: 'Luján' })
  })

  it('fuera de Argentina: result null sin llamar a nadie', async () => {
    const fetchMock = stubFetch({})
    expect(await locate(40.4, -3.7, 'locality')).toEqual({ result: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Georef caído: degraded', async () => {
    stubFetch({ georef: () => jsonResponse({}, 500) })
    expect(await locate(-34.5663, -59.1147, 'locality')).toEqual({ result: null, degraded: true })
  })
})
