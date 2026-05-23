import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { searchPublicTenants } from '@/modules/tenants/search.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const limit = Number(sp.get('limit') ?? '20')
  const offset = Number(sp.get('offset') ?? '0')

  const result = await searchPublicTenants({
    q: sp.get('q') ?? undefined,
    city: sp.get('city') ?? undefined,
    province: sp.get('province') ?? undefined,
    onlineOnly: sp.get('online') === '1',
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
  })

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
