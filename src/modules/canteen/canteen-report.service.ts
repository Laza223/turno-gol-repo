import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { operatingDateOf, operatingDayRangeUtc } from '@/shared/time/operating-day'
import type { CashPaymentMethod } from '@/modules/cashflow/cashflow.types'

/**
 * Reportes de cantina (tab Productos y stock). Dos fuentes, a propósito:
 *  - RANKING: el ledger (stock_movements kind='sale') — cuenta por día de
 *    ENTREGA e incluye fiados aún no cobrados (es "qué se vendió").
 *  - PLATA (por método / por día): cash_flows category='product_sale' —
 *    solo lo COBRADO (tickets + fiados saldados; es "qué entró a la caja").
 * La asimetría es la del modelo de fiados (ver spec 2026-07-22).
 * Fechas: días operativos ART, mismo bucketing que cashflow.service. Las tres
 * funciones reciben `cutoffMins` (ver operating-day.ts) — 0 para tenants
 * normales (closes_next_day=false), donde equivale byte-a-byte al calendario
 * ART de siempre (docs/decisions/2026-07-24-caja-cantina-dia-operativo.md).
 */

/**
 * `operatingDayRangeUtc` da el límite de UN día operativo; un reporte cubre un
 * RANGO (7/30 días, ver caja/productos/page.tsx), así que se arma con el
 * arranque del primer día operativo y el cierre del último — misma idea que
 * `artDayRangeUtc(from, to)` en un solo llamado, pero el helper de día
 * operativo no tiene noción de rango propia (opera de a un día, como lo usan
 * los guards de caja).
 */
function operatingRangeUtc(
  range: { from: string; to: string },
  cutoffMins: number,
): { fromUtc: Date; toUtc: Date } {
  return {
    fromUtc: operatingDayRangeUtc(range.from, cutoffMins).fromUtc,
    toUtc: operatingDayRangeUtc(range.to, cutoffMins).toUtc,
  }
}

export type SalesRankingRow = {
  productId: string
  productName: string
  /** Unidades entregadas en el rango (ventas cobradas + fiadas). */
  units: number
  /** Centavos ARS a precio de venta snapshot (unit_price del ledger). */
  revenue: number
}

export type CanteenMethodTotal = {
  method: CashPaymentMethod
  /** Centavos ARS cobrados por product_sale. */
  total: number
}

export type CanteenDailyTotal = {
  /** Día operativo (YYYY-MM-DD) — ver cutoffMins en getCanteenDailyTotals. */
  day: string
  /** Centavos ARS cobrados por product_sale. */
  total: number
}

export async function getSalesRanking(
  tenantId: string,
  tx: DbTx,
  range: { from: string; to: string },
  cutoffMins: number,
): Promise<SalesRankingRow[]> {
  // LEFT JOIN a canteen_tabs: un fiado ANULADO no es una venta — sus líneas
  // 'sale' quedan en el ledger (append-only; la anulación compensa stock con
  // 'adjustment') pero NO deben contar en el ranking. Sin esta exclusión, un
  // fiado cargado por error inflaba el ranking para siempre (hallazgo ROJO
  // del panel de Fase 7, reproducido contra Postgres real). Ventas de ticket
  // directo tienen tab_id NULL y no se afectan.
  // Rango UTC sargable (ver operatingDayRangeUtc / hallazgo D3).
  const win = operatingRangeUtc(range, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT sm.product_id,
           cp.name AS product_name,
           SUM(-sm.qty)::int AS units,
           SUM(-sm.qty * sm.unit_price)::int AS revenue
    FROM stock_movements sm
    JOIN canteen_products cp ON cp.id = sm.product_id
    LEFT JOIN canteen_tabs ct ON ct.id = sm.tab_id
    WHERE sm.tenant_id = ${tenantId}
      AND sm.kind = 'sale'
      AND (sm.tab_id IS NULL OR ct.status <> 'canceled')
      AND sm.occurred_at >= ${win.fromUtc.toISOString()}
      AND sm.occurred_at < ${win.toUtc.toISOString()}
    GROUP BY sm.product_id, cp.name
    ORDER BY revenue DESC, units DESC
  `)
  return (
    rows as unknown as Array<{
      product_id: string
      product_name: string
      units: number
      revenue: number
    }>
  ).map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    units: r.units,
    revenue: r.revenue,
  }))
}

export async function getCanteenTotalsByMethod(
  tenantId: string,
  tx: DbTx,
  range: { from: string; to: string },
  cutoffMins: number,
): Promise<CanteenMethodTotal[]> {
  // Rango UTC sargable (ver operatingDayRangeUtc / hallazgo D3).
  const win = operatingRangeUtc(range, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT method, SUM(amount)::int AS total
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND category = 'product_sale'
      AND type = 'income'
      AND occurred_at >= ${win.fromUtc.toISOString()}
      AND occurred_at < ${win.toUtc.toISOString()}
    GROUP BY method
    ORDER BY total DESC
  `)
  return (rows as unknown as Array<{ method: CashPaymentMethod; total: number }>).map((r) => ({
    method: r.method,
    total: r.total,
  }))
}

export async function getCanteenDailyTotals(
  tenantId: string,
  tx: DbTx,
  range: { from: string; to: string },
  cutoffMins: number,
): Promise<CanteenDailyTotal[]> {
  // WHERE por rango UTC sargable; el día de cada fila se calcula en JS
  // (operatingDateOf) en vez de un GROUP BY en SQL — cutoffMins varía por
  // tenant, así que no hay una expresión SQL fija posible, y evita repetir el
  // riesgo de una expresión AT TIME ZONE no-leakproof bajo RLS (hallazgo D3,
  // migr. 054). Volumen acotado (7/30 días de un solo tenant): agregar en JS
  // es seguro en costo.
  const win = operatingRangeUtc(range, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT occurred_at, amount::int AS amount
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND category = 'product_sale'
      AND type = 'income'
      AND occurred_at >= ${win.fromUtc.toISOString()}
      AND occurred_at < ${win.toUtc.toISOString()}
  `)
  const totals = new Map<string, number>()
  for (const r of rows as unknown as Array<{ occurred_at: Date | string; amount: number }>) {
    // tx.execute crudo puede devolver Date como string (gotcha del repo).
    const day = operatingDateOf(new Date(r.occurred_at), cutoffMins)
    totals.set(day, (totals.get(day) ?? 0) + r.amount)
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, total]) => ({ day, total }))
}
