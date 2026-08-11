import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/modules/tenants/public.service', () => ({
  getPublicTenant: vi.fn(),
  getPublicAvailability: vi.fn(),
}))

import { getPublicTenant, getPublicAvailability } from '@/modules/tenants/public.service'

const todayStr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

function req(slug: string, date: string) {
  return new NextRequest(`http://localhost/api/public/availability?slug=${slug}&date=${date}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/public/availability — tenant status gating', () => {
  it('returns 404 not_found for an unavailable tenant (suspended)', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'suspended',
      bookingAdvanceDays: 6,
    } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(getPublicAvailability).not.toHaveBeenCalled()
  })

  it('returns availability for an active tenant', async () => {
    vi.mocked(getPublicTenant).mockResolvedValue({
      status: 'active',
      bookingAdvanceDays: 6,
    } as never)
    vi.mocked(getPublicAvailability).mockResolvedValue({ courts: [] } as never)
    const { GET } = await import('@/app/api/public/availability/route')
    const res = await GET(req('rincon', todayStr))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ courts: [] })
  })
})
