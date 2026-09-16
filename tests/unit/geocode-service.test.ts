import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))

import { captureException } from '@/lib/sentry'
import { parseGeorefResponse, searchAddress } from '@/modules/tenants/geocode.service'

/** Respuesta real verificada contra Georef el 2026-09-15 (ver contrato). */
const RESPUESTA_REAL = {
  cantidad: 1,
  total: 1,
  results: [
    {
      nomenclatura: 'BV ORONO 1500, Rosario, Santa Fe',
      ubicacion: { lat: -32.9522688313066, lon: -60.6555845314547 },
    },
  ],
}

describe('parseGeorefResponse', () => {
  it('parsea la respuesta real de Georef en un candidato', () => {
    expect(parseGeorefResponse(RESPUESTA_REAL)).toEqual([
      {
        label: 'BV ORONO 1500, Rosario, Santa Fe',
        lat: -32.9522688313066,
        lng: -60.6555845314547,
      },
    ])
  })

  it('cantidad: 0 es un resultado normal, no un error', () => {
    expect(parseGeorefResponse({ cantidad: 0, total: 0, results: [] })).toEqual([])
  })

  it('descarta un resultado sin ubicación pero conserva los demás', () => {
    const conUnoRoto = {
      cantidad: 2,
      results: [
        { nomenclatura: 'Sin coordenadas 100, Rosario, Santa Fe' },
        {
          nomenclatura: 'BV ORONO 1500, Rosario, Santa Fe',
          ubicacion: { lat: -32.95, lon: -60.65 },
        },
      ],
    }
    expect(parseGeorefResponse(conUnoRoto)).toEqual([
      { label: 'BV ORONO 1500, Rosario, Santa Fe', lat: -32.95, lng: -60.65 },
    ])
  })

  it('JSON basura no tira: devuelve []', () => {
    expect(parseGeorefResponse('esto no es un objeto')).toEqual([])
    expect(parseGeorefResponse(null)).toEqual([])
    expect(parseGeorefResponse(42)).toEqual([])
    expect(parseGeorefResponse({ resultado: 'formato inventado' })).toEqual([])
  })
})

describe('searchAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('devuelve los candidatos de una respuesta 200 válida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(RESPUESTA_REAL), { status: 200 })),
    )
    const result = await searchAddress({
      address: 'Bv Orono 1500',
      city: 'Rosario',
      province: 'Santa Fe',
    })
    expect(result).toEqual([
      { label: 'BV ORONO 1500, Rosario, Santa Fe', lat: -32.9522688313066, lng: -60.6555845314547 },
    ])
    expect(captureException).not.toHaveBeenCalled()
  })

  it('un fetch que rechaza (red caída) reporta y devuelve []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const result = await searchAddress({ address: 'Cualquiera 123' })
    expect(result).toEqual([])
    expect(captureException).toHaveBeenCalled()
  })

  it('un status distinto de 200 reporta y devuelve []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    )
    const result = await searchAddress({ address: 'Cualquiera 123' })
    expect(result).toEqual([])
    expect(captureException).toHaveBeenCalled()
  })

  it('un cuerpo que no es JSON reporta y devuelve []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>no soy json</html>', { status: 200 })),
    )
    const result = await searchAddress({ address: 'Cualquiera 123' })
    expect(result).toEqual([])
    expect(captureException).toHaveBeenCalled()
  })
})
