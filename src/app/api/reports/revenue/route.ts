import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getCashFlowsForExport } from '@/modules/reports/report.service'
import { toCsv } from '@/modules/reports/report.utils'

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export async function GET(req: Request): Promise<Response> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return new Response(null, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const format = searchParams.get('format')

  if (format !== 'csv' || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return new Response('Bad Request', { status: 400 })
  }

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return new Response(null, { status: 401 })

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
