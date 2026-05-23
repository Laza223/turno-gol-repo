import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { boundedText } from '@/shared/validation/primitives'
import { searchPublicTenants } from '@/modules/tenants/search.service'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  q: boundedText(128).optional(),
  city: boundedText(64).optional(),
  province: boundedText(64).optional(),
  online: z.enum(['0', '1']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
})

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    q: sp.get('q') ?? undefined,
    city: sp.get('city') ?? undefined,
    province: sp.get('province') ?? undefined,
    online: sp.get('online') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const { q, city, province, online, limit, offset } = parsed.data

  const result = await searchPublicTenants({
    q,
    city,
    province,
    onlineOnly: online === '1',
    limit,
    offset,
  })

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
