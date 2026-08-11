import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { dateStr } from '@/shared/validation/primitives'
import { guard } from '@/shared/rate-limit/route-guard'
import { validationError } from '@/shared/api-error'
import { withTenant } from '@/server/middleware/with-tenant'
import { getCashFlowsForExport } from '@/modules/reports/report.service'
import { toCsv } from '@/modules/reports/report.utils'
import { resolveCutoffMins } from '@/modules/tenants/tenant-operating-day'
import { operatingDayRangeUtc } from '@/shared/time/operating-day'

const querySchema = z.object({
  from: dateStr,
  to: dateStr,
  format: z.literal('csv'),
})

/**
 * Export CSV de los cash_flows del complejo en un rango de días operativos.
 *
 * Operator-level (admin + manager), el default de `withTenant`: es la misma
 * superficie que /analiticas, desde donde sale el botón de descarga, y el mismo
 * criterio que /api/admin/metrics (el encargado ve la plata del complejo que
 * opera). B10: antes validaba sólo `user.type === 'staff'` + `getStaffTenant`,
 * sin revalidar el rol contra `tenant_staff_members` — un staff dado de baja
 * (`is_active=false`) seguía exportando con su JWT viejo — y sin mirar el
 * lifecycle del tenant, así que un complejo `blocked`/`suspended`/`churned`
 * exportaba todos sus movimientos cuando el layout `(admin)` ya lo tenía
 * hard-lockeado por pantalla.
 */
export const GET = withTenant(async (req: NextRequest, user, tx) => {
  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    format: searchParams.get('format'),
  })
  if (!parsed.success) {
    return validationError(parsed.error) as unknown as NextResponse
  }
  const { from, to } = parsed.data

  const tenantId = user.tenantId!
  const throttled = await guard('adminCrud', tenantId)
  if (throttled) return throttled

  // `from`/`to` son días OPERATIVOS del complejo (los manda /analiticas), no
  // fechas UTC. Antes se armaban con `T00:00:00.000Z` y `T23:59:59.999Z`, que
  // en ART arranca y termina el rango tres horas corrido — el export incluía
  // movimientos de la noche anterior y se perdía los de la última noche.
  //
  // El `.999Z` además era un cierre inclusivo que descartaba el último
  // milisegundo: acá el rango es semi-abierto `[from, to+1)`, igual que en el
  // resto del sistema.
  const cutoffMins = await resolveCutoffMins(tenantId, tx)
  const fromDate = operatingDayRangeUtc(from, cutoffMins).fromUtc
  const toDate = operatingDayRangeUtc(to, cutoffMins).toUtc

  const rows = await getCashFlowsForExport(tenantId, fromDate, toDate, cutoffMins, tx)
  const csv = toCsv(rows as unknown as Record<string, unknown>[])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-${from}-${to}.csv"`,
    },
  })
})
