import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

export const GET = withTenant(async (req: NextRequest, user, tx) => {
  const date = new URL(req.url).searchParams.get('date') ?? artDateOf(new Date())
  const summary = await getDaySummary(user.tenantId!, date, tx)
  return NextResponse.json({ data: summary })
})
