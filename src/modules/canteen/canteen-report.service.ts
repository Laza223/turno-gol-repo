import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import type { CashPaymentMethod } from '@/modules/cashflow/cashflow.types'

/**
 * Reportes de cantina (tab Productos y stock). Dos fuentes, a propósito:
 *  - RANKING: el ledger (stock_movements kind='sale') — cuenta por día de
 *    ENTREGA e incluye fiados aún no cobrados (es "qué se vendió").
 *  - PLATA (por método / por día): cash_flows category='product_sale' —
 *    solo lo COBRADO (tickets + fiados saldados; es "qué entró a la caja").
 * La asimetría es la del modelo de fiados (ver spec 2026-07-22).
 * Fechas: días operativos ART, mismo bucketing que cashflow.service.
 */

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
  /** Día ART (YYYY-MM-DD). */
  day: string
  /** Centavos ARS cobrados por product_sale. */
  total: number
}

export async function getSalesRanking(
  tenantId: string,
  tx: DbTx,
  range: { from: string; to: string },
): Promise<SalesRankingRow[]> {
  // LEFT JOIN a canteen_tabs: un fiado ANULADO no es una venta — sus líneas
  // 'sale' quedan en el ledger (append-only; la anulación compensa stock con
  // 'adjustment') pero NO deben contar en el ranking. Sin esta exclusión, un
  // fiado cargado por error inflaba el ranking para siempre (hallazgo ROJO
  // del panel de Fase 7, reproducido contra Postgres real). Ventas de ticket
  // directo tienen tab_id NULL y no se afectan.
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
      AND (sm.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY sm.product_id, cp.name
    ORDER BY revenue DESC, units DESC
  `)
  return (rows as unknown as Array<{
    product_id: string
    product_name: string
    units: number
    revenue: number
  }>).map((r) => ({
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
): Promise<CanteenMethodTotal[]> {
  const rows = await tx.execute(sql`
    SELECT method, SUM(amount)::int AS total
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND category = 'product_sale'
      AND type = 'income'
      AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY method
    ORDER BY total DESC
  `)
  return (rows as unknown as Array<{ method: CashPaymentMethod; total: number }>).map(
    (r) => ({ method: r.method, total: r.total }),
  )
}

export async function getCanteenDailyTotals(
  tenantId: string,
  tx: DbTx,
  range: { from: string; to: string },
): Promise<CanteenDailyTotal[]> {
  const rows = await tx.execute(sql`
    SELECT (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day,
           SUM(amount)::int AS total
    FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND category = 'product_sale'
      AND type = 'income'
      AND (occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `)
  return (rows as unknown as Array<{ day: string; total: number }>).map((r) => ({
    day: r.day,
    total: r.total,
  }))
}
