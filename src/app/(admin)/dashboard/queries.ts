import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { withTenantContext } from '@/shared/db/client'
import {
  bookings,
  courts,
  players,
  cashFlows,
} from '@/shared/db/schema'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import { nightCutoffMins, operatingDateOf, operatingDayRangeUtc } from '@/shared/time/operating-day'
import { DAY_KEYS } from '@/lib/booking/grid-cells'
import type { OpeningHours, TenantSettings } from '@/modules/tenants/tenant.types'
import type {
  BookingStatus,
  BookingType,
  DepositStatus,
} from '@/modules/bookings/booking.types'
import {
  daySlotsFor,
  occupancyForDay,
  pendingDeposits,
  playedCount,
  upcomingForDay,
  type DayBookingRow,
  type DayOccupancy,
} from '@/lib/dashboard/day-bookings'

export interface DashboardData {
  /** Día ART — la MISMA fecha para caja y reservas (pages/dashboard.md §9). */
  date: string
  /** Hora ART 'HH:MM' al momento del render (para relativos "en X min"). */
  nowHhmm: string
  caja: { incomeCents: number; expenseCents: number; balanceCents: number }
  occupancy: DayOccupancy
  /** true si hoy no hay oferta (closed_dates, día cerrado o sin horario válido). */
  dayIsClosed: boolean
  pendingDeposits: { count: number; amountCents: number }
  /** Ventas de cantina/bar registradas hoy. */
  canteenSales: { count: number; amountCents: number }
  upcoming: DayBookingRow[]
  playedToday: number
  openHhmm: string
  closesNextDay: boolean
}

export interface ChecklistState {
  accountCreated: boolean
  complexData: boolean
  hasCourts: boolean
  hasSchedule: boolean
  mpConnected: boolean
  publicLinkShared: boolean
  firstBookingReceived: boolean
}

interface DashboardTenant {
  id: string
  openingHours: OpeningHours
  closedDates: string[] | null
  closesNextDay: boolean
}

/** Hora ART 'HH:MM' (offset fijo UTC−3, mismo criterio que artDateOf). */
function nowArtHhmm(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 16)
}

export async function getDashboardData(tenant: DashboardTenant): Promise<DashboardData> {
  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  const date = operatingDateOf(new Date(), cutoffMins)
  const nowHhmm = nowArtHhmm()

  const dayKey = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!
  const openHhmm = tenant.openingHours[dayKey]?.open ?? '00:00'
  const slots = daySlotsFor(
    date,
    tenant.openingHours,
    tenant.closedDates ?? [],
    tenant.closesNextDay,
  )

  return withTenantContext(tenant.id, async (tx) => {
    const [summary, bookingRows, courtRows, canteenRow] = await Promise.all([
      getDaySummary(tenant.id, date, cutoffMins, tx),

      tx
        .select({
          id: bookings.id,
          timeStart: bookings.timeStart,
          timeEnd: bookings.timeEnd,
          status: bookings.status,
          type: bookings.type,
          guestName: bookings.guestName,
          priceSnapshot: bookings.priceSnapshot,
          depositStatus: bookings.depositStatus,
          depositAmount: bookings.depositAmount,
          courtName: courts.name,
          playerFirstName: players.firstName,
          playerLastName: players.lastName,
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.courtId, courts.id))
        .leftJoin(players, eq(bookings.playerId, players.id))
        .where(
          and(
            eq(bookings.tenantId, tenant.id),
            sql`${bookings.date} = ${date}::date`,
            sql`${bookings.status} IN ('confirmed', 'pending_payment', 'completed', 'no_show')`,
          ),
        ),

      tx
        .select({ status: courts.status })
        .from(courts)
        .where(eq(courts.tenantId, tenant.id)),

      tx
        .select({
          count: count(),
          amount: sql<number>`COALESCE(SUM(${cashFlows.amount}), 0)::int`,
        })
        .from(cashFlows)
        .where(
          and(
            eq(cashFlows.tenantId, tenant.id),
            // Rango UTC sargable (ver operatingDayRangeUtc / hallazgo D3).
            sql`${cashFlows.occurredAt} >= ${operatingDayRangeUtc(date, cutoffMins).fromUtc.toISOString()}`,
            sql`${cashFlows.occurredAt} < ${operatingDayRangeUtc(date, cutoffMins).toUtc.toISOString()}`,
            eq(cashFlows.category, 'product_sale'),
          ),
        )
        .then((r) => r[0]),
    ])

    const rows: DayBookingRow[] = bookingRows.map((r) => ({
      id: r.id,
      courtName: r.courtName ?? 'Cancha',
      timeStart: r.timeStart.slice(0, 5),
      timeEnd: r.timeEnd.slice(0, 5),
      status: r.status as BookingStatus,
      type: r.type as BookingType,
      depositStatus: r.depositStatus as DepositStatus,
      depositAmount: r.depositAmount,
      guestName: r.guestName ?? null,
      playerFirstName: r.playerFirstName ?? null,
      playerLastName: r.playerLastName ?? null,
      priceSnapshot: r.priceSnapshot,
    }))

    const courtsOnline = courtRows.filter((c) => c.status === 'online').length

    return {
      date,
      nowHhmm,
      caja: {
        incomeCents: summary.totalIncome + summary.totalAdjustments,
        expenseCents: summary.totalExpense,
        balanceCents: summary.balance,
      },
      occupancy: occupancyForDay(rows, slots.length, courtsOnline),
      dayIsClosed: slots.length === 0,
      pendingDeposits: pendingDeposits(rows),
      canteenSales: {
        count: Number(canteenRow?.count ?? 0),
        amountCents: Number(canteenRow?.amount ?? 0),
      },
      upcoming: upcomingForDay(rows, nowHhmm, openHhmm, tenant.closesNextDay),
      playedToday: playedCount(rows),
      openHhmm,
      closesNextDay: tenant.closesNextDay,
    }
  })
}

export async function getChecklistState(
  tenantId: string,
  settings: TenantSettings,
  mpConnected: boolean,
): Promise<ChecklistState> {
  return withTenantContext(tenantId, async (tx) => {
    const [courtsCount, firstBooking] = await Promise.all([
      tx
        .select({ value: count() })
        .from(courts)
        .where(eq(courts.tenantId, tenantId))
        .then((r) => Number(r[0]?.value ?? 0)),

      tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            isNull(bookings.createdByStaff),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null),
    ])

    return {
      accountCreated: true,
      complexData: true,
      hasCourts: courtsCount > 0,
      hasSchedule: true,
      mpConnected,
      publicLinkShared: settings.public_link_shared === true,
      firstBookingReceived: firstBooking !== null,
    }
  })
}
