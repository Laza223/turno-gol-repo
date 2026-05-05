import { and, eq, isNotNull, lt, gte, sql } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import { cashFlows, bookings, courts } from '@/shared/db/schema'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  RevenueReport,
  CourtReport,
  MethodReport,
  PeriodTotals,
  CashFlowExportRow,
} from './report.types'
import { calcAvailableMinutes, calcOccupancyPct } from './report.utils'

type PeriodAgg = {
  income: number
  adjustment: number
  byMethod: MethodReport[]
  byCourt: {
    courtId: string
    courtName: string
    income: number
    bookingCount: number
    bookedMinutes: number
  }[]
  bookingCount: number
  courtCount: number
}

async function fetchPeriodAgg(tenantId: string, from: Date, to: Date): Promise<PeriodAgg> {
  const fromStr = from.toISOString().split('T')[0]  // 'YYYY-MM-DD'
  const toStr = to.toISOString().split('T')[0]      // 'YYYY-MM-DD' (exclusive)

  return withTenantContext(tenantId, async (tx) => {
    const [typeRows, courtRows, bookingCountRows, courtCountRows] = await Promise.all([
      // Q1: sum amounts grouped by cashflow type + payment method
      tx
        .select({
          type: cashFlows.type,
          method: cashFlows.method,
          total: sql<number>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS INTEGER)`,
        })
        .from(cashFlows)
        .where(and(gte(cashFlows.occurredAt, from), lt(cashFlows.occurredAt, to)))
        .groupBy(cashFlows.type, cashFlows.method),

      // Q2: income + booked minutes per court (only booking-linked cash flows)
      tx
        .select({
          courtId: courts.id,
          courtName: courts.name,
          income: sql<number>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS INTEGER)`,
          bookingCount: sql<number>`CAST(COUNT(DISTINCT ${cashFlows.bookingId}) AS INTEGER)`,
          bookedMinutes: sql<number>`CAST(COALESCE(
            SUM(EXTRACT(EPOCH FROM (${bookings.timeEnd}::time - ${bookings.timeStart}::time)) / 60),
            0
          ) AS INTEGER)`,
        })
        .from(cashFlows)
        .innerJoin(bookings, eq(cashFlows.bookingId, bookings.id))
        .innerJoin(courts, eq(bookings.courtId, courts.id))
        .where(
          and(
            gte(cashFlows.occurredAt, from),
            lt(cashFlows.occurredAt, to),
            isNotNull(cashFlows.bookingId),
          ),
        )
        .groupBy(courts.id, courts.name),

      // Q3: total booking count (all non-canceled statuses)
      tx
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(bookings)
        .where(
          sql`${bookings.date} >= ${fromStr}::date
            AND ${bookings.date} < ${toStr}::date
            AND ${bookings.status} IN ('confirmed', 'completed', 'no_show')`,
        ),

      // Q4: number of online courts (for occupancy denominator)
      tx
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(courts)
        .where(eq(courts.status, 'online')),
    ])

    const income = typeRows
      .filter((r) => r.type === 'income')
      .reduce((acc, r) => acc + Number(r.total), 0)

    const adjustment = typeRows
      .filter((r) => r.type === 'adjustment')
      .reduce((acc, r) => acc + Number(r.total), 0)

    const methodMap = new Map<string, number>()
    for (const r of typeRows) {
      methodMap.set(r.method, (methodMap.get(r.method) ?? 0) + Number(r.total))
    }
    const byMethod: MethodReport[] = Array.from(methodMap.entries())
      .filter(([, total]) => total > 0)
      .map(([method, total]) => ({ method: method as MethodReport['method'], total }))

    return {
      income,
      adjustment,
      byMethod,
      byCourt: courtRows.map((r) => ({
        courtId: r.courtId,
        courtName: r.courtName,
        income: Number(r.income),
        bookingCount: Number(r.bookingCount),
        bookedMinutes: Number(r.bookedMinutes),
      })),
      bookingCount: Number(bookingCountRows[0]?.count ?? 0),
      courtCount: Number(courtCountRows[0]?.count ?? 0),
    }
  })
}

/**
 * Returns a full revenue report for the period [from, to).
 * Runs current + previous period queries in parallel.
 * `prevPeriod` is null when the previous period has zero activity.
 */
export async function getRevenueReport(
  tenantId: string,
  from: Date,
  to: Date,
  openingHours: OpeningHours,
  prevFrom: Date,
  prevTo: Date,
  closedDates?: string[] | null,
): Promise<RevenueReport> {
  const [current, prev] = await Promise.all([
    fetchPeriodAgg(tenantId, from, to),
    fetchPeriodAgg(tenantId, prevFrom, prevTo),
  ])

  const totalAvailable = calcAvailableMinutes(from, to, openingHours, current.courtCount, closedDates)
  const perCourtAvailable = current.courtCount > 0 ? totalAvailable / current.courtCount : 0

  const byCourt: CourtReport[] = current.byCourt.map((c) => ({
    courtId: c.courtId,
    courtName: c.courtName,
    income: c.income,
    bookingCount: c.bookingCount,
    occupancyPct: calcOccupancyPct(c.bookedMinutes, perCourtAvailable),
  }))

  const prevPeriod: PeriodTotals | null =
    prev.income === 0 && prev.adjustment === 0
      ? null
      : {
          income: prev.income,
          adjustment: prev.adjustment,
          balance: prev.income + prev.adjustment,
        }

  return {
    period: { from, to },
    income: current.income,
    adjustment: current.adjustment,
    balance: current.income + current.adjustment,
    bookingCount: current.bookingCount,
    byCourt,
    byMethod: current.byMethod,
    prevPeriod,
  }
}

/** Returns all cash flows in [from, to) with court name resolved via booking join. */
export async function getCashFlowsForExport(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<CashFlowExportRow[]> {
  return withTenantContext(tenantId, async (tx) => {
    const rows = await tx
      .select({
        occurredAt: cashFlows.occurredAt,
        type: cashFlows.type,
        category: cashFlows.category,
        amount: cashFlows.amount,
        method: cashFlows.method,
        description: cashFlows.description,
        courtName: courts.name,
      })
      .from(cashFlows)
      .leftJoin(bookings, eq(cashFlows.bookingId, bookings.id))
      .leftJoin(courts, eq(bookings.courtId, courts.id))
      .where(and(gte(cashFlows.occurredAt, from), lt(cashFlows.occurredAt, to)))
      .orderBy(cashFlows.occurredAt)

    return rows.map((r) => ({
      fecha: r.occurredAt.toISOString().split('T')[0],
      tipo: r.type,
      categoria: r.category,
      monto_ars: r.amount,
      metodo: r.method,
      descripcion: r.description,
      cancha: r.courtName ?? '',
    }))
  })
}
