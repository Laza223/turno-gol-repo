import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/modules/geo/geo.service', () => ({
  findLocalities: vi.fn(),
  findAddresses: vi.fn(),
  locate: vi.fn(),
}))
vi.mock('@/shared/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/rate-limit')>()),
  enforce: vi.fn(async () => ({
    ok: true,
    limit: 20,
    remaining: 19,
    reset: 0,
    unavailable: false,
  })),
}))

import { GET as localidadesGET } from '@/app/api/public/geo/localidades/route'
import { GET as direccionesGET } from '@/app/api/public/geo/direcciones/route'
import { GET as reverseGET } from '@/app/api/public/geo/reverse/route'
import { findAddresses, findLocalities, locate } from '@/modules/geo/geo.service'
import { enforce } from '@/shared/rate-limit'

const req = (path: string) => new NextRequest(`http://localhost/api/public/geo/${path}`)
const LUJAN = {
  city: 'Luján',
  province: 'Buenos Aires',
  department: 'Luján',
  lat: -34.57,
  lng: -59.11,
  source: 'dataset' as const,
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/public/geo/localidades', () => {
  it('400 con q muy corta, vacía o ausente', async () => {
    for (const p of [
      'localidades',
      'localidades?q=',
      'localidades?q=a',
      `localidades?q=${'x'.repeat(81)}`,
    ]) {
      const res = await localidadesGET(req(p))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_params' })
    }
  })

  it('200 con el shape y el Cache-Control público', async () => {
    vi.mocked(findLocalities).mockResolvedValue({ results: [LUJAN] })
    const res = await localidadesGET(req('localidades?q=lujan&limit=1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(
      'public, s-maxage=86400, stale-while-revalidate=604800',
    )
    expect(await res.json()).toEqual({ results: [LUJAN] })
  })

  it('una respuesta degradada no se cachea en el CDN', async () => {
    vi.mocked(findLocalities).mockResolvedValue({ results: [], degraded: true })
    const res = await localidadesGET(req('localidades?q=jauregui'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ results: [], degraded: true })
  })

  it('una excepción inesperada es 500', async () => {
    vi.mocked(findLocalities).mockRejectedValue(new Error('boom'))
    expect((await localidadesGET(req('localidades?q=lujan'))).status).toBe(500)
  })
})

describe('GET /api/public/geo/direcciones', () => {
  it('400 sin calle o con localityId inválido', async () => {
    expect((await direccionesGET(req('direcciones'))).status).toBe(400)
    expect((await direccionesGET(req('direcciones?street=ab'))).status).toBe(400)
    expect(
      (await direccionesGET(req('direcciones?street=Mitre%20800&localityId=abc'))).status,
    ).toBe(400)
  })

  it('200, no-store, y aplica el rate limit externo', async () => {
    vi.mocked(findAddresses).mockResolvedValue({ results: [], degraded: true })
    const res = await direccionesGET(
      req('direcciones?street=Mitre%20800&city=Luj%C3%A1n&province='),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ results: [], degraded: true })
    expect(enforce).toHaveBeenCalledWith('publicGeoExternal', expect.any(String))
    expect(findAddresses).toHaveBeenCalledWith({ street: 'Mitre 800', city: 'Luján' })
  })

  it('429 si se pasó del límite, sin llamar al servicio', async () => {
    vi.mocked(enforce).mockResolvedValueOnce({
      ok: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 1000,
      unavailable: false,
    })
    expect((await direccionesGET(req('direcciones?street=Mitre%20800'))).status).toBe(429)
    expect(findAddresses).not.toHaveBeenCalled()
  })
})

describe('GET /api/public/geo/reverse', () => {
  it('400 con coordenadas ausentes, vacías, fuera de rango o precisión inválida', async () => {
    for (const p of [
      'reverse',
      'reverse?lat=&lng=',
      'reverse?lat=95&lng=-59',
      'reverse?lat=-34&lng=-59&precision=x',
    ]) {
      expect((await reverseGET(req(p))).status).toBe(400)
    }
  })

  it('200 no-store; precisión por defecto "locality"', async () => {
    vi.mocked(locate).mockResolvedValue({
      result: { city: 'Luján', province: 'Buenos Aires', lat: -34.5663, lng: -59.1147 },
    })
    const res = await reverseGET(req('reverse?lat=-34.5663&lng=-59.1147'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(locate).toHaveBeenCalledWith(-34.5663, -59.1147, 'locality')
    expect((await res.json()).result.city).toBe('Luján')
    expect(enforce).toHaveBeenCalledWith('publicGeoExternal', expect.any(String))
  })
})
