import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { getDaySummary } from '@/modules/cashflow/cashflow.service'
import { countPendingRefunds } from '@/modules/payments/refund.service'
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

/**
 * Cuánto se ocupó el día. Es lo único que Hoy y el worker del resumen diario
 * (D8) leen de la ocupación: el tablero de turnos ya no sale de acá, lo arma la
 * pantalla con el loader compartido con la Grilla (`listDayGridBookings`).
 */
async function getOccupancy(
  tenantId: string,
  date: string,
  opts: GetHoyDataOpts,
  tx: DbTx,
): Promise<HoyData['numbers']['occupancy']> {
  const [bookingRows, courtRows] = await Promise.all([
    tx.execute(sql`
      SELECT b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd", b.type
      FROM bookings b
      WHERE b.tenant_id = ${tenantId} AND b.date = ${date}::date
        AND b.status IN ('confirmed', 'pending_payment', 'completed', 'no_show')
    `),
    tx.execute(sql`SELECT status FROM courts WHERE tenant_id = ${tenantId}`),
  ])

  const rows = bookingRows as unknown as DayBookingRow[]
  const online = (courtRows as unknown as Array<{ status: string }>).filter(
    (c) => c.status === 'online',
  )
  const slots = daySlotsFor(date, opts.openingHours, opts.closedDates ?? [], opts.closesNextDay)
  return occupancyForDay(rows, slots.length, online.length)
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
      -- 'fixed' (abonado) nunca lo carga un jugador desde el portal: los slots
      -- rolling del worker (generate-abonado-slots.worker.ts) y los del alta
      -- (insertBookingsForSlots, abonado.service.ts) nacen con created_by_staff
      -- NULL igual que una reserva online — created_by_staff solo no alcanza
      -- para distinguirlas. QA 2026-09-13: 4 fijos daban "10 reservas online".
      AND b.type = 'spontaneous'
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
 * agregador único de la home (del dueño y del Encargado desde 2026-09-19).
 * Devuelve los números (cobrado y ocupación), lo que pasó sin el dueño y las
 * anomalías que exigen una decisión. La lista de turnos NO sale de acá: el
 * tablero "Turnos de hoy" se arma con el loader compartido con la Grilla, y el
 * turno terminado sin cobrar vive ahí, no como alerta (una cosa, un lugar).
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

  const [
    todaySummary,
    occupancy,
    failedDeposits,
    onlineBookings,
    cancellations,
    depositsPaid,
    pendingRefunds,
  ] = await Promise.all([
    getDaySummary(tenantId, date, cutoffMins, tx),
    getOccupancy(tenantId, date, opts, tx),
    getFailedDepositsToday(tenantId, date, cutoffMins, tx),
    getOnlineBookingsToday(tenantId, date, cutoffMins, tx),
    getCancellationsToday(tenantId, date, cutoffMins, tx),
    getDepositsPaidToday(tenantId, date, cutoffMins, tx),
    countPendingRefunds(tenantId, tx),
  ])

  // Tenant-wide y sin filtro por fecha, a diferencia de las otras tres: una
  // devolución que el complejo debe desde hace una semana sigue debiéndose hoy.
  // Por eso también es UN ítem agregado y no una fila por devolución.
  const refundAlerts: AttentionItem[] =
    pendingRefunds.count > 0
      ? [
          {
            kind: 'pending_refunds',
            count: pendingRefunds.count,
            totalCents: pendingRefunds.totalCents,
            since: pendingRefunds.oldestAt ?? new Date(),
          },
        ]
      : []

  const needsAttention = sortAttentionItems([...failedDeposits, ...refundAlerts])
  const whileYouWereAway = sortWhileAwayItems([
    ...onlineBookings,
    ...cancellations,
    ...depositsPaid,
  ])

  return {
    date,
    numbers: {
      // B14: `collected` es la cuenta única (cashflow/totals.ts). Nadie lo suma
      // a mano de este lado: el resumen diario y la pantalla leen el mismo valor.
      collectedTodayCents: todaySummary.collected,
      occupancy,
    },
    whileYouWereAway,
    needsAttention,
  }
}
