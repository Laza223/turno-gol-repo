import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { dateStr } from '@/shared/validation/primitives'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, validationError } from '@/shared/api-error'
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
 * Techo del rango exportable, en días (B10).
 *
 * `getCashFlowsForExport` no tiene `LIMIT` —correctamente: un export de plata
 * truncado en silencio es peor que uno que falla, porque el complejo cierra su
 * contabilidad con un CSV al que le faltan filas y nada se lo dice. Pero sin
 * techo de rango, `?from=1900-01-01&to=2999-12-31` trae TODOS los movimientos
 * del complejo a memoria y arma un string CSV con ellos, dentro de una función
 * serverless. La respuesta correcta es rechazar el pedido, no recortarlo.
 *
 * 366 días cubre un año fiscal completo (con bisiesto), que es el rango real
 * para el que se usa esto. Más que eso se pide en tramos.
 */
const MAX_EXPORT_DAYS = 366
const MS_PER_DAY = 86_400_000

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

  // Antes del rate-limit y antes de tocar la DB: un rango imposible no merece
  // ni una conexión.
  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY + 1
  if (!Number.isFinite(spanDays) || spanDays < 1) {
    return badRequest('El rango es inválido: "hasta" no puede ser anterior a "desde".', {
      code: 'INVALID_RANGE',
    }) as unknown as NextResponse
  }
  if (spanDays > MAX_EXPORT_DAYS) {
    return badRequest(
      `El rango no puede superar los ${MAX_EXPORT_DAYS} días. Descargá el período en tramos.`,
      { code: 'RANGE_TOO_LARGE' },
    ) as unknown as NextResponse
  }

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
