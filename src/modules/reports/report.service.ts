import { and, eq, inArray, isNotNull, lt, gte, sql } from 'drizzle-orm'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { cashFlows, bookings, courts } from '@/shared/db/schema'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type {
  RevenueReport,
  CourtReport,
  MethodReport,
  PeriodTotals,
  CashFlowExportRow,
} from './report.types'
import {
  aggregateByMethod,
  calcAvailableMinutes,
  calcOccupancyPct,
  getMonthBounds,
  prevMonthStr,
  type MonthBounds,
} from './report.utils'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'

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

/**
 * Recibe el período ya resuelto en sus DOS formas en vez de derivar una de la
 * otra: `cash_flows.occurred_at` es un instante y `bookings.date` ya es un día
 * operativo. Antes esto hacía `from.toISOString().split('T')[0]`, que en ART
 * corre el día para todo lo que caiga después de las 21:00.
 */
async function fetchPeriodAgg(tenantId: string, bounds: MonthBounds): Promise<PeriodAgg> {
  const { fromUtc: from, toUtc: to, fromDate: fromStr, toDate: toStr } = bounds

  return withTenantContext(tenantId, async (tx) => {
    const [typeRows, courtIncomeRows, courtMinuteRows, bookingCountRows, courtCountRows] =
      await Promise.all([
        // Q1: sum amounts grouped by cashflow type + payment method
        tx
          .select({
            type: cashFlows.type,
            method: cashFlows.method,
            total: sql<string>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS BIGINT)`,
          })
          .from(cashFlows)
          .where(
            and(
              eq(cashFlows.tenantId, tenantId),
              gte(cashFlows.occurredAt, from),
              lt(cashFlows.occurredAt, to),
            ),
          )
          .groupBy(cashFlows.type, cashFlows.method),

        // Q2a: income + booking count per court (from cash_flows linked to bookings).
        // `category = 'booking'` no es decorativo: desde Fase 3 una venta de
        // cantina puede llevar `booking_id` (consumo cargado al turno). Sin el
        // filtro, la cerveza se sumaría a "lo que facturó la cancha".
        tx
          .select({
            courtId: courts.id,
            courtName: courts.name,
            income: sql<string>`CAST(COALESCE(SUM(${cashFlows.amount}), 0) AS BIGINT)`,
            bookingCount: sql<string>`CAST(COUNT(DISTINCT ${cashFlows.bookingId}) AS BIGINT)`,
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
              eq(cashFlows.category, 'booking'),
            ),
          )
          .groupBy(courts.id, courts.name),

        // Q2b: booked minutes per court — queried from bookings directly to avoid
        // double-counting when a booking has multiple cash flows
        tx
          .select({
            courtId: bookings.courtId,
            bookedMinutes: sql<string>`CAST(COALESCE(
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
          .select({ count: sql<string>`CAST(COUNT(*) AS BIGINT)` })
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
          .select({ count: sql<string>`CAST(COUNT(*) AS BIGINT)` })
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
  month: string,
  openingHours: OpeningHours,
  closedDates?: string[] | null,
  closesNextDay = false,
): Promise<RevenueReport> {
  // El período se resuelve ACÁ, no en el caller. Antes la firma pedía cuatro
  // `Date` sueltos (from/to/prevFrom/prevTo) y el caller los armaba con
  // medianoche UTC: bastaba con que uno estuviera mal para que el reporte
  // contara un mes distinto que /caja, sin que nada fallara.
  const cutoffMins = nightCutoffMins(openingHours, closesNextDay)
  const bounds = getMonthBounds(month, cutoffMins)
  const prevBounds = getMonthBounds(prevMonthStr(month), cutoffMins)

  const [current, prev] = await Promise.all([
    fetchPeriodAgg(tenantId, bounds),
    fetchPeriodAgg(tenantId, prevBounds),
  ])

  const totalAvailable = calcAvailableMinutes(
    bounds.fromDate,
    bounds.toDate,
    openingHours,
    current.courtCount,
    closedDates,
    closesNextDay,
  )
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
    period: { from: bounds.fromUtc, to: bounds.toUtc },
    income: current.income,
    adjustment: current.adjustment,
    balance: current.income + current.adjustment,
    bookingCount: current.bookingCount,
    byCourt,
    byMethod: current.byMethod,
    prevPeriod,
  }
}

/**
 * Cash flows en `[from, to)` con el nombre de cancha resuelto por el join.
 *
 * `cutoffMins` no es opcional por comodidad: la columna `fecha` del CSV salía
 * de `occurredAt.toISOString().split('T')[0]`, o sea UTC crudo. Un cobro de las
 * 22:00 ART del día 5 se exportaba con fecha 6 — el mismo movimiento que
 * `/caja` muestra en el día 5. Dos papeles con fechas distintas para el mismo
 * hecho económico es exactamente lo que P2 prohíbe.
 */
export async function getCashFlowsForExport(
  tenantId: string,
  from: Date,
  to: Date,
  cutoffMins: number,
  tx: DbTx,
): Promise<CashFlowExportRow[]> {
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
    .where(
      and(
        eq(cashFlows.tenantId, tenantId),
        gte(cashFlows.occurredAt, from),
        lt(cashFlows.occurredAt, to),
      ),
    )
    .orderBy(cashFlows.occurredAt)

  return rows.map((r) => ({
    fecha: operatingDateOf(r.occurredAt, cutoffMins),
    tipo: r.type,
    categoria: r.category,
    monto_ars: r.amount,
    metodo: r.method,
    descripcion: r.description,
    cancha: r.courtName ?? '',
  }))
}
