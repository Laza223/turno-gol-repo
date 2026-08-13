import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dateStr, slug } from '@/shared/validation/primitives'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'
import { isTenantPubliclyVisible } from '@/modules/tenants/tenant-status'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  slug,
  start: dateStr,
})

function addDays(dateStrIn: string, n: number): string {
  const [y, m, d] = dateStrIn.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({
    slug: req.nextUrl.searchParams.get('slug'),
    start: req.nextUrl.searchParams.get('start'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }
  const { slug: tenantSlug, start } = parsed.data

  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const todayStr = artNow.toISOString().slice(0, 10)

  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant || !isTenantPubliclyVisible(tenant.status)) {
    // Mismo gate que la API de disponibilidad diaria (security scan F15): un
    // complejo suspendido/bloqueado/dado de baja no debe seguir exponiendo
    // una semana entera de horarios/precios vía esta API.
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const maxStart = addDays(todayStr, tenant.bookingAdvanceDays)
  if (start < todayStr || start > maxStart) {
    return NextResponse.json({ error: 'date_out_of_range' }, { status: 400 })
  }

  const week = await getPublicWeeklyAvailability(tenant, start)
  return NextResponse.json(week, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
