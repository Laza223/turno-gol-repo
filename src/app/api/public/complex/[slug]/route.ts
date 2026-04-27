import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicTenant } from '@/modules/tenants/public.service'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const tenant = await getPublicTenant(params.slug)
  if (!tenant) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(tenant, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
