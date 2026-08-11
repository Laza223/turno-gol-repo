import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import { getDailyClose } from '@/modules/cashflow/daily-close.service'
import { getDayOpen } from '@/modules/cashflow/cash-open.service'
import { getStreetMoney, sumStreetMoney } from '@/modules/cashflow/street-money.service'
import { addDays } from '@/shared/dates/art'
import { operatingDayRangeUtc } from '@/shared/time/operating-day'
import { daySlotsFor, occupancyForDay, type DayBookingRow } from '@/lib/dashboard/day-bookings'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { HoyData, WhileAwayItem, AttentionItem } from './home.types'
import { sortAttentionItems, sortWhileAwayItems } from './home.lib'

export type GetHoyDataOpts = {
  /** Día operativo sobre el que se arma la respuesta (HOY para la pantalla en
   *  vivo; el día del resumen para el worker de D8). */
  date: string
  cutoffMins: number
  openingHours: OpeningHours
  closedDates: string[] | null
  closesNextDay: boolean
}

function timeLabel(timeStart: string, timeEnd: string): string {
  return `${timeStart.slice(0, 5)}-${timeEnd.slice(0, 5)}`
}

function contactNameOf(
  guestName: string | null,
  firstName: string | null,
  lastName: string | null,
): string {
  if (guestName) return guestName
  const full = [firstName, lastName].filter(Boolean).join(' ')
  return full || 'Sin nombre'
}

async function getOccupancy(
  tenantId: string,
  date: string,
  opts: GetHoyDataOpts,
  tx: DbTx,
): Promise<{ occupied: number; available: number; blocked: number; pct: number }> {
  const [bookingRows, courtRows] = await Promise.all([
    tx.execute(sql`
      SELECT time_start::text AS "timeStart", time_end::text AS "timeEnd",
             status, type, deposit_status AS "depositStatus", deposit_amount AS "depositAmount",
             guest_name AS "guestName"
      FROM bookings
      WHERE tenant_id = ${tenantId} AND date = ${date}::date
        AND status IN ('confirmed', 'pending_payment', 'completed', 'no_show')
    `),
    tx.execute(sql`SELECT status FROM courts WHERE tenant_id = ${tenantId}`),
  ])

  const rows: DayBookingRow[] = (
    bookingRows as unknown as Array<{
      timeStart: string
      timeEnd: string
      status: string
      type: string
      depositStatus: string
      depositAmount: number
      guestName: string | null
    }>
  ).map((r) => ({
    id: '',
    courtName: '',
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    status: r.status as DayBookingRow['status'],
    type: r.type as DayBookingRow['type'],
    depositStatus: r.depositStatus as DayBookingRow['depositStatus'],
    depositAmount: r.depositAmount,
    guestName: r.guestName,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 0,
  }))

  const courtsOnline = (courtRows as unknown as Array<{ status: string }>).filter(
    (c) => c.status === 'online',
  ).length
  const slots = daySlotsFor(date, opts.openingHours, opts.closedDates ?? [], opts.closesNextDay)
  return occupancyForDay(rows, slots.length, courtsOnline)
}

async function hasCashFlowsOnDate(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<boolean> {
  const range = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT 1 FROM cash_flows
    WHERE tenant_id = ${tenantId}
      AND occurred_at >= ${range.fromUtc.toISOString()}
      AND occurred_at < ${range.toUtc.toISOString()}
    LIMIT 1
  `)
  return (rows as unknown[]).length > 0
}

async function getFailedDepositsToday(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<AttentionItem[]> {
  const range = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT p.id AS "paymentId", p.booking_id AS "bookingId", p.amount, p.created_at AS "createdAt",
           c.name AS "courtName", b.guest_name AS "guestName",
           pl.first_name AS "firstName", pl.last_name AS "lastName"
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = ${tenantId}
    LEFT JOIN players pl ON pl.id = b.player_id
    WHERE p.tenant_id = ${tenantId}
      AND p.type = 'deposit'
      AND p.status IN ('rejected', 'canceled')
      -- Solo si sigue siendo el pago ACTIVO del booking: payments no tiene
      -- UNIQUE en (booking_id, type), un reintento inserta una fila nueva y
      -- mueve bookings.payment_id a esa fila nueva (ver retryDepositPaymentAction).
      -- Sin este filtro, un reintento exitoso (seña #2 approved) deja la
      -- alerta de la seña #1 rechazada colgada todo el día operativo.
      AND p.id = b.payment_id
      AND p.created_at >= ${range.fromUtc.toISOString()}
      AND p.created_at < ${range.toUtc.toISOString()}
    ORDER BY p.created_at ASC
  `)
  return (
    rows as unknown as Array<{
      paymentId: string
      bookingId: string
      amount: number
      createdAt: string
      courtName: string
      guestName: string | null
      firstName: string | null
      lastName: string | null
    }>
  ).map((r) => ({
    kind: 'failed_deposit',
    paymentId: r.paymentId,
    bookingId: r.bookingId,
    amountCents: r.amount,
    since: new Date(r.createdAt),
    courtName: r.courtName,
    contactName: contactNameOf(r.guestName, r.firstName, r.lastName),
  }))
}

async function getOnlineBookingsToday(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<WhileAwayItem[]> {
  const range = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT b.id, b.created_at AS "createdAt", b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           c.name AS "courtName", b.guest_name AS "guestName",
           pl.first_name AS "firstName", pl.last_name AS "lastName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = ${tenantId}
    LEFT JOIN players pl ON pl.id = b.player_id
    WHERE b.tenant_id = ${tenantId}
      AND b.created_by_staff IS NULL
      AND b.created_at >= ${range.fromUtc.toISOString()}
      AND b.created_at < ${range.toUtc.toISOString()}
    ORDER BY b.created_at ASC
  `)
  return (
    rows as unknown as Array<{
      id: string
      createdAt: string
      timeStart: string
      timeEnd: string
      courtName: string
      guestName: string | null
      firstName: string | null
      lastName: string | null
    }>
  ).map((r) => ({
    kind: 'booking_online',
    bookingId: r.id,
    at: new Date(r.createdAt),
    courtName: r.courtName,
    timeLabel: timeLabel(r.timeStart, r.timeEnd),
    contactName: contactNameOf(r.guestName, r.firstName, r.lastName),
  }))
}

async function getCancellationsToday(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<WhileAwayItem[]> {
  const range = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT b.id, b.canceled_at AS "canceledAt", b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           c.name AS "courtName", b.guest_name AS "guestName",
           pl.first_name AS "firstName", pl.last_name AS "lastName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = ${tenantId}
    LEFT JOIN players pl ON pl.id = b.player_id
    WHERE b.tenant_id = ${tenantId}
      AND b.canceled_by IS NOT NULL
      AND b.canceled_by != 'admin'
      AND b.canceled_at >= ${range.fromUtc.toISOString()}
      AND b.canceled_at < ${range.toUtc.toISOString()}
    ORDER BY b.canceled_at ASC
  `)
  return (
    rows as unknown as Array<{
      id: string
      canceledAt: string
      timeStart: string
      timeEnd: string
      courtName: string
      guestName: string | null
      firstName: string | null
      lastName: string | null
    }>
  ).map((r) => ({
    kind: 'cancellation',
    bookingId: r.id,
    at: new Date(r.canceledAt),
    courtName: r.courtName,
    timeLabel: timeLabel(r.timeStart, r.timeEnd),
    contactName: contactNameOf(r.guestName, r.firstName, r.lastName),
  }))
}

async function getDepositsPaidToday(
  tenantId: string,
  date: string,
  cutoffMins: number,
  tx: DbTx,
): Promise<WhileAwayItem[]> {
  const range = operatingDayRangeUtc(date, cutoffMins)
  const rows = await tx.execute(sql`
    SELECT p.booking_id AS "bookingId", p.amount, p.processed_at AS "processedAt",
           c.name AS "courtName", b.guest_name AS "guestName",
           pl.first_name AS "firstName", pl.last_name AS "lastName"
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    JOIN courts c ON c.id = b.court_id AND c.tenant_id = ${tenantId}
    LEFT JOIN players pl ON pl.id = b.player_id
    WHERE p.tenant_id = ${tenantId}
      AND p.type = 'deposit'
      AND p.status = 'approved'
      AND p.processed_at IS NOT NULL
      AND p.processed_at >= ${range.fromUtc.toISOString()}
      AND p.processed_at < ${range.toUtc.toISOString()}
    ORDER BY p.processed_at ASC
  `)
  return (
    rows as unknown as Array<{
      bookingId: string
      amount: number
      processedAt: string
      courtName: string
      guestName: string | null
      firstName: string | null
      lastName: string | null
    }>
  ).map((r) => ({
    kind: 'deposit_paid',
    bookingId: r.bookingId,
    at: new Date(r.processedAt),
    amountCents: r.amount,
    courtName: r.courtName,
    contactName: contactNameOf(r.guestName, r.firstName, r.lastName),
  }))
}

/**
 * "Hoy" (Fase 2 — docs/planning/2026-08-01-decisiones-de-fase-v2.md §3):
 * agregador único de la home solo-admin (D5). Reusa getStreetMoney (Fase 1)
 * para "plata en la calle" y para el alert "turno sin cobrar" — nunca
 * recalcula esa cifra, es la garantía de fuente única del contrato.
 *
 * `opts.date` es el día que se está reportando: la pantalla en vivo pasa HOY;
 * el worker de resumen diario (D8) pasa AYER y solo lee `numbers` (alertas y
 * feed de ese caso quedan sin uso, aceptado — ver docs/decisions/2026-08-02-taxonomia-alertas-hoy.md).
 */
export async function getHoyData(
  tenantId: string,
  tx: DbTx,
  opts: GetHoyDataOpts,
): Promise<HoyData> {
  const { date, cutoffMins } = opts
  const lastWeekDate = addDays(date, -7)
  const yesterday = addDays(date, -1)

  const [
    todaySummary,
    lastWeekSummary,
    streetMoneyRows,
    occupancy,
    todayClose,
    yesterdayClose,
    yesterdayOpen,
    yesterdayHadActivity,
    failedDeposits,
    onlineBookings,
    cancellations,
    depositsPaid,
  ] = await Promise.all([
    getDaySummary(tenantId, date, cutoffMins, tx),
    getDaySummary(tenantId, lastWeekDate, cutoffMins, tx),
    getStreetMoney(tenantId, tx),
    getOccupancy(tenantId, date, opts, tx),
    getDailyClose(tenantId, date, tx),
    getDailyClose(tenantId, yesterday, tx),
    getDayOpen(tenantId, yesterday, tx),
    hasCashFlowsOnDate(tenantId, yesterday, cutoffMins, tx),
    getFailedDepositsToday(tenantId, date, cutoffMins, tx),
    getOnlineBookingsToday(tenantId, date, cutoffMins, tx),
    getCancellationsToday(tenantId, date, cutoffMins, tx),
    getDepositsPaidToday(tenantId, date, cutoffMins, tx),
  ])

  const unpaidBookingAlerts: AttentionItem[] = streetMoneyRows
    .filter(
      (r): r is Extract<typeof r, { origin: 'booking' }> =>
        r.origin === 'booking' && r.date === date,
    )
    .map((r) => ({
      kind: 'unpaid_completed_booking',
      bookingId: r.refId,
      pendingCents: r.pendingCents,
      since: r.since,
      courtName: r.courtName,
      timeLabel: timeLabel(r.timeStart, r.timeEnd),
      contactName: r.debtorName,
    }))

  const yesterdayUnclosed: AttentionItem[] =
    yesterdayClose === null && (yesterdayOpen !== null || yesterdayHadActivity)
      ? [
          {
            kind: 'yesterday_cash_unclosed',
            date: yesterday,
            since: new Date(`${yesterday}T00:00:00Z`),
          },
        ]
      : []

  const needsAttention = sortAttentionItems([
    ...unpaidBookingAlerts,
    ...failedDeposits,
    ...yesterdayUnclosed,
  ])
  const whileYouWereAway = sortWhileAwayItems([
    ...onlineBookings,
    ...cancellations,
    ...depositsPaid,
  ])

  return {
    date,
    numbers: {
      collectedTodayCents: todaySummary.totalIncome + todaySummary.totalAdjustments,
      collectedSameWeekdayLastWeekCents:
        lastWeekSummary.totalIncome + lastWeekSummary.totalAdjustments,
      occupancy,
      streetMoneyCents: sumStreetMoney(streetMoneyRows),
      cashClosed: todayClose !== null,
    },
    whileYouWereAway,
    needsAttention,
  }
}
