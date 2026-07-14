import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { slug as slugSchema } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const parsed = slugSchema.safeParse(params.slug)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const tenant = await getPublicTenant(parsed.data)
  if (!tenant) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(tenant, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
