import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/modules/tenants/search.service', () => ({
  searchPublicTenants: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { GET } from '@/app/api/public/zona/route'
import { searchPublicTenants } from '@/modules/tenants/search.service'
import { captureException } from '@/lib/sentry'

const searchMock = searchPublicTenants as unknown as ReturnType<typeof vi.fn>
const captureMock = captureException as unknown as ReturnType<typeof vi.fn>

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/public/zona', { headers })
}

const AR = {
  'x-vercel-ip-country': 'AR',
  'x-vercel-ip-latitude': '-32.9468',
  'x-vercel-ip-longitude': '-60.6393',
}

const card = (distanceKm: number | null) => ({
  results: [{ city: 'Rosario', province: 'Santa Fe', distanceKm }],
  total: 1,
})

async function expectNull(res: Response) {
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ zona: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  searchMock.mockResolvedValue(card(12))
})

describe('GET /api/public/zona', () => {
  it('sin headers → null y no llama al servicio', async () => {
    await expectNull(await GET(req()))
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('país distinto de AR → null', async () => {
    await expectNull(await GET(req({ ...AR, 'x-vercel-ip-country': 'UY' })))
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('lat inválida → null', async () => {
    await expectNull(await GET(req({ ...AR, 'x-vercel-ip-latitude': '95' })))
    await expectNull(await GET(req({ ...AR, 'x-vercel-ip-latitude': 'abc' })))
    await expectNull(await GET(req({ ...AR, 'x-vercel-ip-longitude': '200' })))
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('complejo a 12 km → { city, province }', async () => {
    const res = await GET(req(AR))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ zona: { city: 'Rosario', province: 'Santa Fe' } })
    expect(searchMock).toHaveBeenCalledWith({
      lat: -32.9468,
      lng: -60.6393,
      sort: 'distance',
      limit: 1,
      offset: 0,
    })
  })

  it('complejo a 80 km → null', async () => {
    searchMock.mockResolvedValue(card(80))
    await expectNull(await GET(req(AR)))
  })

  it('sin resultados → null', async () => {
    searchMock.mockResolvedValue({ results: [], total: 0 })
    await expectNull(await GET(req(AR)))
  })

  it('el servicio tira → null con 200 y captureException', async () => {
    const boom = new Error('db down')
    searchMock.mockRejectedValue(boom)
    await expectNull(await GET(req(AR)))
    expect(captureMock).toHaveBeenCalledWith(boom)
  })

  it('Cache-Control private, no-store en todos los caminos', async () => {
    searchMock.mockRejectedValueOnce(new Error('x'))
    const responses = [
      await GET(req()),
      await GET(req({ ...AR, 'x-vercel-ip-country': 'UY' })),
      await GET(req({ ...AR, 'x-vercel-ip-latitude': 'abc' })),
      await GET(req(AR)), // servicio tira
      await GET(req(AR)), // 12 km
    ]
    for (const res of responses) {
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    }
  })

  it('la respuesta no contiene lat/lng', async () => {
    const text = await (await GET(req(AR))).text()
    expect(text).not.toContain('-32.9468')
    expect(text).not.toContain('-60.6393')
    expect(text).not.toMatch(/lat|lng/i)
  })
})
