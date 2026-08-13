import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { isTenantPubliclyVisible } from '@/modules/tenants/tenant-status'
import { slug as slugSchema } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const parsed = slugSchema.safeParse(params.slug)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const tenant = await getPublicTenant(parsed.data)
  if (!tenant || !isTenantPubliclyVisible(tenant.status)) {
    // Un complejo suspendido/bloqueado/dado de baja no debe exponer su perfil
    // público vía esta API (security scan F14 — mismo gate que availability).
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(tenant, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
