import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { listOpenMatchesQuerySchema } from '@/modules/open-matches/open-match.schema'
import { getOpenMatches } from '@/modules/open-matches/open-match.service'

export const dynamic = 'force-dynamic'

// GET /api/public/open-matches — vitrina pública de "Falta Uno" con filtros.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = listOpenMatchesQuerySchema.safeParse({
    tenantId: sp.get('tenantId') ?? undefined,
    city: sp.get('city') ?? undefined,
    province: sp.get('province') ?? undefined,
    status: sp.get('status') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const result = await getOpenMatches(parsed.data)
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  })
}
