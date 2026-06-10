import { and, eq, inArray, isNotNull, lt, gte, sql } from 'drizzle-orm'
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
import { aggregateByMethod, calcAvailableMinutes, calcOccupancyPct } from './report.utils'

const ACTIVE_STATUSES = ['confirmed', 'completed', 'no_show'] as Array<
  'confirmed' | 'completed' | 'no_show'
>

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
  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  return withTenantContext(tenantId, async (tx) => {
    const [typeRows, courtIncomeRows, courtMinuteRows, bookingCountRows, courtCountRows] =
      await Promise.all([
        // Q1: sum amounts grouped by cashflow type + payment method
        tx
          .select({
            type: cashFlows.type,
            method: cashFlows.method,
            total: sql<number>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS BIGINT)`,
          })
          .from(cashFlows)
          .where(and(eq(cashFlows.tenantId, tenantId), gte(cashFlows.occurredAt, from), lt(cashFlows.occurredAt, to)))
          .groupBy(cashFlows.type, cashFlows.method),

        // Q2a: income + booking count per court (from cash_flows linked to bookings)
        tx
          .select({
            courtId: courts.id,
            courtName: courts.name,
            income: sql<number>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS BIGINT)`,
            bookingCount: sql<number>`CAST(COUNT(DISTINCT ${cashFlows.bookingId}) AS BIGINT)`,
          })
          .from(cashFlows)
          .innerJoin(bookings, eq(cashFlows.bookingId, bookings.id))
          .innerJoin(courts, eq(bookings.courtId, courts.id))
          .where(
            and(
              eq(cashFlows.tenantId, tenantId),
              gte(cashFlows.occurredAt, from),
              lt(cashFlows.occurredAt, to),
              isNotNull(cashFlows.bookingId),
            ),
          )
          .groupBy(courts.id, courts.name),

        // Q2b: booked minutes per court — queried from bookings directly to avoid
        // double-counting when a booking has multiple cash flows
        tx
          .select({
            courtId: bookings.courtId,
            bookedMinutes: sql<number>`CAST(COALESCE(
              SUM(EXTRACT(EPOCH FROM (${bookings.timeEnd}::time - ${bookings.timeStart}::time)) / 60),
              0
            ) AS BIGINT)`,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.tenantId, tenantId),
              sql`${bookings.date} >= ${fromStr}::date AND ${bookings.date} < ${toStr}::date`,
              inArray(bookings.status, ACTIVE_STATUSES),
            ),
          )
          .groupBy(bookings.courtId),

        // Q3: total booking count (non-canceled statuses) in the period
        tx
          .select({ count: sql<number>`CAST(COUNT(*) AS BIGINT)` })
          .from(bookings)
          .where(
            and(
              eq(bookings.tenantId, tenantId),
              sql`${bookings.date} >= ${fromStr}::date AND ${bookings.date} < ${toStr}::date`,
              inArray(bookings.status, ACTIVE_STATUSES),
            ),
          ),

        // Q4: number of online courts (occupancy denominator)
        tx
          .select({ count: sql<number>`CAST(COUNT(*) AS BIGINT)` })
          .from(courts)
          .where(and(eq(courts.tenantId, tenantId), eq(courts.status, 'online'))),
      ])

    const income = typeRows
      .filter((r) => r.type === 'income')
      .reduce((acc, r) => acc + Number(r.total), 0)

    const adjustment = typeRows
      .filter((r) => r.type === 'adjustment')
      .reduce((acc, r) => acc + Number(r.total), 0)

    // Solo income por método: los adjustment no inflan la tabla por método (#43).
    const byMethod = aggregateByMethod(typeRows)

    const minutesByCourtId = new Map(
      courtMinuteRows.map((r) => [r.courtId, Number(r.bookedMinutes)]),
    )

    return {
      income,
      adjustment,
      byMethod,
      byCourt: courtIncomeRows.map((r) => ({
        courtId: r.courtId,
        courtName: r.courtName,
        income: Number(r.income),
        bookingCount: Number(r.bookingCount),
        bookedMinutes: minutesByCourtId.get(r.courtId) ?? 0,
      })),
      bookingCount: Number(bookingCountRows[0]?.count ?? 0),
      courtCount: Number(courtCountRows[0]?.count ?? 0),
    }
  })
}

/**
 * Returns a full revenue report for the period [from, to).
 * Current + previous period run in parallel (two independent read transactions).
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
      .where(and(eq(cashFlows.tenantId, tenantId), gte(cashFlows.occurredAt, from), lt(cashFlows.occurredAt, to)))
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
