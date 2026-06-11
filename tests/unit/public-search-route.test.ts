import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mocks must be declared before importing the route module.
vi.mock('@/modules/tenants/search.service', () => ({
  searchPublicTenants: vi.fn(),
}))
vi.mock('@/modules/tenants/availability-search.service', () => ({
  findAvailableTenantIds: vi.fn(),
}))

import { GET } from '@/app/api/public/search/route'
import { searchPublicTenants } from '@/modules/tenants/search.service'
import { findAvailableTenantIds } from '@/modules/tenants/availability-search.service'

const searchMock = searchPublicTenants as unknown as ReturnType<typeof vi.fn>
const availMock = findAvailableTenantIds as unknown as ReturnType<typeof vi.fn>

const TENANT_A = '22222222-2222-2222-2222-222222222222'

const CARD = {
  id: TENANT_A,
  slug: 'club-a',
  name: 'Club A',
  address: 'Calle 1',
  city: 'Rosario',
  province: 'Santa Fe',
  logoUrl: null,
  coverUrl: null,
  allowOnlineBooking: true,
  fromPriceCents: 800000,
  amenities: {},
  avgRating: 4.5,
  reviewCount: 3,
  distanceKm: null,
  latitude: null,
  longitude: null,
  courtSurfaces: ['synthetic_grass'],
  courtFormats: [5],
}

function req(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/public/search${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  searchMock.mockResolvedValue({ results: [CARD], total: 1 })
  availMock.mockResolvedValue([TENANT_A])
})

describe('GET /api/public/search — sin fecha+hora (regresión)', () => {
  it('never consults availability and passes no tenantIds', async () => {
    const res = await GET(req('?q=club'))
    expect(res.status).toBe(200)
    expect(availMock).not.toHaveBeenCalled()
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock.mock.calls[0]![0]).not.toHaveProperty('tenantIds')
  })

  it('with only date (no time) the availability filter stays off', async () => {
    const res = await GET(req('?date=2026-06-12'))
    expect(res.status).toBe(200)
    expect(availMock).not.toHaveBeenCalled()
  })

  it('with only time (no date) the availability filter stays off', async () => {
    const res = await GET(req('?time=20:00'))
    expect(res.status).toBe(200)
    expect(availMock).not.toHaveBeenCalled()
  })

  it('keeps the 60s CDN cache header', async () => {
    const res = await GET(req('?q=club'))
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60')
  })
})

describe('GET /api/public/search — con fecha+hora', () => {
  it('resolves availability and restricts the search to those tenants', async () => {
    const res = await GET(req('?date=2026-06-12&time=20:00&formats=5,7'))
    expect(res.status).toBe(200)
    expect(availMock).toHaveBeenCalledWith({
      date: '2026-06-12',
      time: '20:00',
      formats: [5, 7],
    })
    expect(searchMock.mock.calls[0]![0]).toMatchObject({ tenantIds: [TENANT_A] })
  })

  it('omits formats in the availability lookup when none are selected', async () => {
    await GET(req('?date=2026-06-12&time=20:00'))
    expect(availMock).toHaveBeenCalledWith({
      date: '2026-06-12',
      time: '20:00',
      formats: undefined,
    })
  })

  it('dedupes repeated formats (cache-key y SQL params acotados)', async () => {
    await GET(req(`?date=2026-06-12&time=20:00&formats=${'5,'.repeat(500)}7`))
    expect(availMock).toHaveBeenCalledWith({
      date: '2026-06-12',
      time: '20:00',
      formats: [5, 7],
    })
  })

  it('returns the search result built from the restricted set', async () => {
    availMock.mockResolvedValue([])
    searchMock.mockResolvedValue({ results: [], total: 0 })
    const res = await GET(req('?date=2026-06-12&time=20:00'))
    const body = await res.json()
    expect(body).toEqual({ results: [], total: 0 })
    expect(searchMock.mock.calls[0]![0]).toMatchObject({ tenantIds: [] })
  })

  it('drops the CDN cache to 30s to match the availability TTL', async () => {
    const res = await GET(req('?date=2026-06-12&time=20:00'))
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=30')
  })

  it('rejects an invalid calendar date with 400', async () => {
    const res = await GET(req('?date=2026-02-30&time=20:00'))
    expect(res.status).toBe(400)
    expect(availMock).not.toHaveBeenCalled()
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed time with 400', async () => {
    const res = await GET(req('?date=2026-06-12&time=25:99'))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/public/search — contrato de salida', () => {
  it('serializes the SearchResult shape (results + total)', async () => {
    const res = await GET(req('?q=club'))
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toMatchObject({ id: TENANT_A, slug: 'club-a' })
  })

  it('does not 500 on contract drift: dirty data still serves (fail-open)', async () => {
    // amenities con valores no-boolean (jsonb sucio) rompe el schema de salida;
    // el endpoint público debe degradar a la respuesta cruda, nunca caerse.
    const dirty = { ...CARD, amenities: { wifi: 'yes' } }
    searchMock.mockResolvedValue({ results: [dirty], total: 1 })
    const res = await GET(req('?q=club'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.results[0].id).toBe(TENANT_A)
  })
})
