import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { listReviewsQuerySchema } from '@/modules/reviews/review.schema'
import { getAverageRating, getReviewsByTenant } from '@/modules/reviews/review.service'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/public/reviews/[tenantId] — lista pública de reseñas + promedio.
export async function GET(req: NextRequest, props: { params: Promise<{ tenantId: string }> }) {
  const params = await props.params
  const tenantId = params.tenantId
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const sp = req.nextUrl.searchParams
  const parsed = listReviewsQuerySchema.safeParse({
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const [page, summary] = await Promise.all([
    getReviewsByTenant(tenantId, parsed.data.limit, parsed.data.offset),
    getAverageRating(tenantId),
  ])

  return NextResponse.json(
    { reviews: page.reviews, total: page.total, summary },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}
