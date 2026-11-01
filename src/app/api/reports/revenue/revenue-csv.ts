/**
 * El CSV de caja que baja Métricas, con el mismo formato es-AR que el export
 * de Ajustes → Tus datos (`data-export.ts`: `;`, BOM, CRLF, pesos con coma
 * decimal). Antes salía con `,` —en Excel es-AR abría todo en la columna A— y
 * con el monto en centavos bajo una columna que decía pesos.
 *
 * Vive en `app` y no en `modules/reports` porque los labels de categoría y el
 * título de un movimiento son los de la pantalla de Caja (`caja-lib.ts`), y
 * `@/modules` no puede importar de `@/app`.
 */
import type { CashFlowExportRow } from '@/modules/reports/report.types'
import { assembleCsvFile, csvBody, csvLine, pesosCell } from '@/modules/reports/data-export'
import { METHOD_LABELS } from '@/lib/payment-method'
import { categoryLabel, movementTitle } from '@/app/(admin)/caja/caja-lib'

const TYPE_LABEL: Record<CashFlowExportRow['type'], string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  adjustment: 'Ajuste',
}

export const REVENUE_EXPORT_HEADER = csvLine([
  'Fecha',
  'Tipo',
  'Categoría',
  'Monto',
  'Método',
  'Descripción',
  'Cancha',
])

/**
 * El gasto sale en negativo para que la suma de la columna dé el resultado del
 * período, el mismo `balance` de Caja (`balanceFrom`: ingresos + ajustes −
 * gastos). En la DB el monto es siempre positivo y el signo lo dice `type`.
 */
export function revenueExportRow(r: CashFlowExportRow): string[] {
  return [
    r.date,
    TYPE_LABEL[r.type],
    categoryLabel(r.type, r.category),
    pesosCell(r.type === 'expense' ? -r.amount : r.amount),
    METHOD_LABELS[r.method],
    movementTitle(r.description),
    r.courtName,
  ]
}

/** El archivo entero. Sin movimientos sale igual el encabezado, no un archivo vacío. */
export function buildRevenueCsv(rows: readonly CashFlowExportRow[]): string {
  return assembleCsvFile(REVENUE_EXPORT_HEADER, [csvBody(rows.map(revenueExportRow))])
}
