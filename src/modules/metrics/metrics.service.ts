import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { bookings, cashFlows } from '@/shared/db/schema'
import { operatingDateOf, operatingDayRangeUtc } from '@/shared/time/operating-day'
import { resolveCutoffMins } from '@/modules/tenants/tenant-operating-day'

export const METRICS_WINDOW_DAYS = 30

// Statuses that count as a real reservation for the per-day series: everything
// that was confirmed at some point. Excludes `pending_payment` (never
// confirmed) and `expired` (abandoned checkout) so the series reflects demand,
// not abandoned funnels.
const COUNTED_BOOKING_STATUSES = [
  'confirmed',
  'completed',
  'no_show',
  'canceled_refunded',
  'canceled_no_refund',
] as const

export type DailyCount = { date: string; count: number }

export type DailyAmount = { date: string; amountCents: number }

export type TimeSlotCount = { time: string; count: number } // time en 'HH:MM'

export type NoShowMetric = {
  noShow: number
  completed: number
  finished: number // noShow + completed
  rate: number // noShow / finished, 0 when there are no finished bookings
}

type RevenueMetric = {
  totalCents: number // sum of cash_flows.amount (centavos) with type='income'
  byCategory: Record<string, number>
}

export type TenantMetrics = {
  windowDays: number
  from: string // YYYY-MM-DD, inclusive
  to: string // YYYY-MM-DD, inclusive
  bookingsPerDay: DailyCount[]
  revenuePerDay: DailyAmount[] // ingresos por día ART, zero-filled
  topSlots: TimeSlotCount[] // top 5 horarios de inicio más reservados
  noShow: NoShowMetric
  noShowPrev: NoShowMetric // ventana anterior (mismos días, terminando en from-1)
  revenue: RevenueMetric
}

// ─── Pure helpers (unit-tested) ──────────────────────────────────────

/** Add `n` days to a YYYY-MM-DD date using UTC math (no DST/TZ drift). */
export function addDaysUtc(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** Inclusive [from, to] window of `days` calendar days ending at `today`. */
export function metricsWindow(today: string, days: number): { from: string; to: string } {
  return { from: addDaysUtc(today, -(days - 1)), to: today }
}

/** no_show / (completed + no_show); 0 when there are no finished bookings. */
export function computeNoShowRate(noShow: number, completed: number): number {
  const finished = noShow + completed
  return finished === 0 ? 0 : noShow / finished
}

/**
 * Zero-fill a sparse daily series so every day in [from, to] is present and the
 * result is ascending by date. Days with no rows report count 0.
 */
export function fillDailySeries(
  rows: Array<{ date: string; count: number }>,
  from: string,
  to: string,
): DailyCount[] {
  const counts = new Map(rows.map((r) => [r.date, r.count]))
  const series: DailyCount[] = []
  let cursor = from
  // Bounded loop (≤ ~1 year) so a malformed window can never spin forever.
  for (let i = 0; i <= 366 && cursor <= to; i++) {
    series.push({ date: cursor, count: counts.get(cursor) ?? 0 })
    cursor = addDaysUtc(cursor, 1)
  }
  return series
}

/**
 * Ventana inmediatamente anterior a [from, to], del mismo largo: termina el día
 * previo a `from`. Para tendencias (ej: tasa de ausencias vs período anterior).
 */
export function previousWindow(
  window: { from: string; to: string },
  days: number,
): {
  from: string
  to: string
} {
  return { from: addDaysUtc(window.from, -days), to: addDaysUtc(window.from, -1) }
}

/**
 * Top N horarios de inicio por cantidad, desempate por hora ascendente.
 * Normaliza 'HH:MM:SS' (formato del tipo `time` de Postgres) a 'HH:MM'.
 */
export function rankTopSlots(
  rows: Array<{ time: string; count: number }>,
  limit = 5,
): TimeSlotCount[] {
  return [...rows]
    .sort((a, b) => b.count - a.count || a.time.localeCompare(b.time))
    .slice(0, limit)
    .map((r) => ({ time: r.time.slice(0, 5), count: r.count }))
}

// ─── DB-backed aggregate ─────────────────────────────────────────────

// `resolveCutoffMins` (cutoffMins del tenant para el bucketing de cash_flows)
// se movió a `@/modules/tenants/tenant-operating-day` para que `reports` use
// exactamente el mismo cutoff. Antes tenía el suyo — o más bien no tenía
// ninguno, y por eso los reportes facturaban en UTC calendario.

/** Breakdown de estados terminales en [from, to] → NoShowMetric. */
async function noShowForWindow(
  tenantId: string,
  tx: DbTx,
  from: string,
  to: string,
): Promise<NoShowMetric> {
  const statusRows = await tx
    .select({
      status: bookings.status,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        gte(bookings.date, sql`${from}::date`),
        lte(bookings.date, sql`${to}::date`),
      ),
    )
    .groupBy(bookings.status)

  const statusCount = (s: string) => statusRows.find((r) => r.status === s)?.count ?? 0
  const noShow = statusCount('no_show')
  const completed = statusCount('completed')
  return {
    noShow,
    completed,
    finished: noShow + completed,
    rate: computeNoShowRate(noShow, completed),
  }
}

/**
 * Business metrics for the current tenant over the last METRICS_WINDOW_DAYS.
 * `tx` is already tenant-scoped (RLS via app.current_tenant_id); the explicit
 * tenant_id filter additionally engages idx_bookings_date_status /
 * idx_cash_flows_tenant_date. Date windows use the booking slot `date` (ya
 * día operativo, ver bookings.date); revenue usa cash_flows.occurredAt,
 * agrupado por el día operativo del tenant (cutoffMins, ver operating-day.ts
 * / ADR día operativo).
 */
export async function getTenantMetrics(
  tenantId: string,
  tx: DbTx,
  now: Date = new Date(),
): Promise<TenantMetrics> {
  const cutoffMins = await resolveCutoffMins(tenantId, tx)
  const { from, to } = metricsWindow(operatingDateOf(now, cutoffMins), METRICS_WINDOW_DAYS)
  const prev = previousWindow({ from, to }, METRICS_WINDOW_DAYS)

  // 1) Reservations per slot-day (committed statuses only).
  const dailyRows = await tx
    .select({
      date: sql<string>`${bookings.date}::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        gte(bookings.date, sql`${from}::date`),
        lte(bookings.date, sql`${to}::date`),
        inArray(bookings.status, [...COUNTED_BOOKING_STATUSES]),
      ),
    )
    .groupBy(bookings.date)

  // 2) Status breakdown → no-show rate de la ventana actual y la anterior
  //    (la previa alimenta la tendencia en el dashboard).
  const noShowMetric = await noShowForWindow(tenantId, tx, from, to)
  const noShowPrev = await noShowForWindow(tenantId, tx, prev.from, prev.to)

  // Rango sargable de ingresos en día operativo — cutoffMins=0 (la inmensa
  // mayoría de tenants) da el mismo corrimiento ART fijo (medianoche = 03:00
  // UTC) que usaban ambas queries de abajo hasta ahora.
  const { fromUtc } = operatingDayRangeUtc(from, cutoffMins)
  const { toUtc } = operatingDayRangeUtc(to, cutoffMins)

  // 3) Income by category. amount is centavos (>0); sum as bigint to dodge int
  //    overflow on high-volume tenants, then parse to a JS number.
  const revenueRows = await tx
    .select({
      category: cashFlows.category,
      total: sql<string>`coalesce(sum(${cashFlows.amount}), 0)::bigint`,
    })
    .from(cashFlows)
    .where(
      and(
        eq(cashFlows.tenantId, tenantId),
        eq(cashFlows.type, 'income'),
        gte(cashFlows.occurredAt, fromUtc),
        lt(cashFlows.occurredAt, toUtc),
      ),
    )
    .groupBy(cashFlows.category)

  // Seed the income categories (per the cash_flows type/category check
  // constraint) at 0 so the response shape is stable even when a category has
  // no rows in the window.
  const byCategory: Record<string, number> = { booking: 0, product_sale: 0, other: 0 }
  let totalCents = 0
  for (const r of revenueRows) {
    // Number() is safe here: realistic 30-day per-tenant income stays well under
    // JS's 2^53 safe-integer ceiling (~9e15 centavos). The bigint cast above only
    // guards the SQL-side int32 sum overflow.
    const cents = Number(r.total)
    byCategory[r.category] = cents
    totalCents += cents
  }

  // 4) Ingresos por día. Ventana acotada a METRICS_WINDOW_DAYS (30 días) de UN
  //    tenant — a lo sumo cientos de filas, no miles ni histórico completo —
  //    así que el bucketing por día operativo se agrega en JS post-fetch
  //    (mismo patrón que getCanteenDailyTotals) en vez de una expresión SQL
  //    de GROUP BY que no puede parametrizarse por el cutoffMins dinámico del
  //    tenant.
  const revenueRawRows = await tx
    .select({
      occurredAt: cashFlows.occurredAt,
      amount: cashFlows.amount,
    })
    .from(cashFlows)
    .where(
      and(
        eq(cashFlows.tenantId, tenantId),
        eq(cashFlows.type, 'income'),
        gte(cashFlows.occurredAt, fromUtc),
        lt(cashFlows.occurredAt, toUtc),
      ),
    )

  const dailyTotals = new Map<string, number>()
  for (const r of revenueRawRows) {
    const day = operatingDateOf(r.occurredAt, cutoffMins)
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + r.amount)
  }

  const revenuePerDay: DailyAmount[] = fillDailySeries(
    [...dailyTotals.entries()].map(([date, count]) => ({ date, count })),
    from,
    to,
  ).map((d) => ({ date: d.date, amountCents: d.count }))

  // 5) Top 5 horarios de inicio más reservados (mismos statuses que la serie).
  const slotRows = await tx
    .select({
      time: sql<string>`${bookings.timeStart}::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        gte(bookings.date, sql`${from}::date`),
        lte(bookings.date, sql`${to}::date`),
        inArray(bookings.status, [...COUNTED_BOOKING_STATUSES]),
      ),
    )
    .groupBy(bookings.timeStart)

  return {
    windowDays: METRICS_WINDOW_DAYS,
    from,
    to,
    bookingsPerDay: fillDailySeries(dailyRows, from, to),
    revenuePerDay,
    topSlots: rankTopSlots(slotRows),
    noShow: noShowMetric,
    noShowPrev,
    revenue: { totalCents, byCategory },
  }
}
