import { z } from 'zod'
import { dateStr } from '@/shared/validation/primitives'
import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getCashFlowsForExport } from '@/modules/reports/report.service'
import { toCsv } from '@/modules/reports/report.utils'

const querySchema = z.object({
  from: dateStr,
  to: dateStr,
  format: z.literal('csv'),
})

export async function GET(req: Request): Promise<Response> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return new Response(null, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    format: searchParams.get('format'),
  })
  if (!parsed.success) {
    return new Response('Bad Request', { status: 400 })
  }
  const { from, to } = parsed.data

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return new Response(null, { status: 401 })

  const rl = await enforce('adminCrud', tenant.id)
  if (!rl.ok) return rateLimit429(rl)

  const fromDate = new Date(`${from}T00:00:00.000Z`)
  const toDate = new Date(`${to}T23:59:59.999Z`)

  const rows = await getCashFlowsForExport(tenant.id, fromDate, toDate)
  const csv = toCsv(rows as unknown as Record<string, unknown>[])

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-${from}-${to}.csv"`,
    },
  })
}
