import { z } from 'zod'
import { dateStr } from '@/shared/validation/primitives'
import { enforce, rateLimit429 } from '@/shared/rate-limit'
import { unauthorized, validationError } from '@/shared/api-error'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { getCashFlowsForExport } from '@/modules/reports/report.service'
import { toCsv } from '@/modules/reports/report.utils'
import { nightCutoffMins, operatingDayRangeUtc } from '@/shared/time/operating-day'

const querySchema = z.object({
  from: dateStr,
  to: dateStr,
  format: z.literal('csv'),
})

export async function GET(req: Request): Promise<Response> {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) {
    return unauthorized()
  }

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    format: searchParams.get('format'),
  })
  if (!parsed.success) {
    return validationError(parsed.error)
  }
  const { from, to } = parsed.data

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) return unauthorized()

  const rl = await enforce('adminCrud', tenant.id)
  if (!rl.ok) return rateLimit429(rl)

  // `from`/`to` son días OPERATIVOS del complejo (los manda /analiticas), no
  // fechas UTC. Antes se armaban con `T00:00:00.000Z` y `T23:59:59.999Z`, que
  // en ART arranca y termina el rango tres horas corrido — el export incluía
  // movimientos de la noche anterior y se perdía los de la última noche.
  //
  // El `.999Z` además era un cierre inclusivo que descartaba el último
  // milisegundo: acá el rango es semi-abierto `[from, to+1)`, igual que en el
  // resto del sistema.
  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const fromDate = operatingDayRangeUtc(from, cutoffMins).fromUtc
  const toDate = operatingDayRangeUtc(to, cutoffMins).toUtc

  const rows = await getCashFlowsForExport(tenant.id, fromDate, toDate, cutoffMins)
  const csv = toCsv(rows as unknown as Record<string, unknown>[])

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-${from}-${to}.csv"`,
    },
  })
}
