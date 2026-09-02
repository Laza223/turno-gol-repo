import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicTenant } from '@/modules/tenants/public.service'
import { isPublicPortalOpen } from '@/modules/tenants/tenant.lifecycle'
import { slug as slugSchema } from '@/shared/validation/primitives'
import { captureException } from '@/lib/sentry'
import { internal } from '@/shared/api-error'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const parsed = slugSchema.safeParse(params.slug)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  let tenant
  try {
    tenant = await getPublicTenant(parsed.data)
  } catch (err) {
    captureException(err)
    return internal('No se pudo procesar la solicitud.')
  }
  if (!tenant || !isPublicPortalOpen(tenant.status, tenant.canceledPeriodEnd)) {
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
