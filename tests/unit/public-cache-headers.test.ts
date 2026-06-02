import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the data layer so we exercise only the route handlers' response shaping
// (headers), not the DB.
vi.mock('@/modules/tenants/search.service', () => ({
  searchPublicTenants: vi.fn(async () => ({ results: [], total: 0 })),
  listPublicCities: vi.fn(async () => []),
}))

import { GET as searchGET } from '@/app/api/public/search/route'
import { GET as citiesGET } from '@/app/api/public/cities/route'

// Public read endpoints serve anonymous, visitor-identical data, so each sets an
// INLINE stale-while-revalidate Cache-Control on its NextResponse — guaranteed
// to reach the client/CDN (no next.config force-dynamic precedence ambiguity).
// This pins the policy + TTL per endpoint and fails loudly if a header is
// dropped or its TTL drifts. (fs-scan style matches e2e-endpoint-guard /
// zod-coverage.) TTLs scale with volatility: live availability (30s) <
// directory data (60s) < city list (300s).
const ROOT = path.resolve(__dirname, '..', '..')

const EXPECTED: Array<{ file: string; cacheControl: string }> = [
  { file: 'src/app/api/public/availability/route.ts', cacheControl: 'public, s-maxage=30, stale-while-revalidate=60' },
  { file: 'src/app/api/public/availability/week/route.ts', cacheControl: 'public, s-maxage=30, stale-while-revalidate=60' },
  { file: 'src/app/api/public/search/route.ts', cacheControl: 'public, s-maxage=60, stale-while-revalidate=300' },
  { file: 'src/app/api/public/complex/[slug]/route.ts', cacheControl: 'public, s-maxage=60, stale-while-revalidate=120' },
  { file: 'src/app/api/public/cities/route.ts', cacheControl: 'public, s-maxage=300, stale-while-revalidate=600' },
]

describe('public endpoints declare inline SWR Cache-Control', () => {
  for (const { file, cacheControl } of EXPECTED) {
    it(`${file} sets Cache-Control: ${cacheControl}`, () => {
      const src = readFileSync(path.join(ROOT, file), 'utf8')
      expect(src).toContain(`'Cache-Control': '${cacheControl}'`)
    })
  }
})

describe('public endpoints actually emit the header (handler invocation)', () => {
  it('GET /api/public/cities responds with the SWR Cache-Control', async () => {
    const res = await citiesGET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
  })

  it('GET /api/public/search responds with the SWR Cache-Control', async () => {
    const req = new NextRequest('http://localhost/api/public/search?city=La%20Plata')
    const res = await searchGET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
  })
})
