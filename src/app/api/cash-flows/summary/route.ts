import { badRequest } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import { daySummaryResponseSchema } from '@/modules/cashflow/cashflow.schema'
import type { NextRequest } from 'next/server'
import { dateStr } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

export const GET = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const raw = new URL(req.url).searchParams.get('date')
  let date: string
  if (raw === null) {
    date = artDateOf(new Date())
  } else {
    const parsed = dateStr.safeParse(raw)
    if (!parsed.success) {
      return badRequest('invalid_date', { code: 'BAD_REQUEST' })
    }
    date = parsed.data
  }
  const summary = await getDaySummary(user.tenantId!, date, tx)
  return validatedJson(daySummaryResponseSchema, { data: summary }, 'GET /api/cash-flows/summary')
})
