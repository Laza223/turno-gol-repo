import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicTenant, getPublicWeeklyAvailability } from '@/modules/tenants/public.service'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const slug = sp.get('slug')
  const start = sp.get('start')
  if (!slug || !start || !DATE_RE.test(start)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
  }

  const artNow = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const todayStr = artNow.toISOString().slice(0, 10)

  const tenant = await getPublicTenant(slug)
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const maxStart = addDays(todayStr, tenant.bookingAdvanceDays)
  if (start < todayStr || start > maxStart) {
    return NextResponse.json({ error: 'date_out_of_range' }, { status: 400 })
  }

  const week = await getPublicWeeklyAvailability(tenant, start)
  return NextResponse.json(week, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
