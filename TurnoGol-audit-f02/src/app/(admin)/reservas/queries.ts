import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

export type ReservaListRow = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  status: string
  type: string
  courtName: string
  playerName: string | null
  guestName: string | null
  priceSnapshot: number
}

export async function listTenantBookings(
  tenantId: string,
  filters: { date?: string; status?: string },
  tx: DbTx,
): Promise<ReservaListRow[]> {
  const dateCond = filters.date ? sql`AND b.date = ${filters.date}::date` : sql``
  const statusCond = filters.status ? sql`AND b.status = ${filters.status}::booking_status` : sql``
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           c.name AS "courtName",
           CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
           b.guest_name AS "guestName"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId} ${dateCond} ${statusCond}
    ORDER BY b.date DESC, b.time_start DESC
    LIMIT 200
  `)
  return rows as unknown as ReservaListRow[]
}

export type ReservaDetail = ReservaListRow & {
  depositAmount: number
  depositStatus: string
  paymentMethod: string | null
  notesPlayer: string | null
  notesInternal: string | null
  playerPhone: string | null
  guestPhone: string | null
  canceledReason: string | null
}

export async function getBookingDetail(
  tenantId: string,
  bookingId: string,
  tx: DbTx,
): Promise<ReservaDetail | null> {
  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text AS date, b.time_start::text AS "timeStart", b.time_end::text AS "timeEnd",
           b.status, b.type, b.price_snapshot AS "priceSnapshot",
           b.deposit_amount AS "depositAmount", b.deposit_status AS "depositStatus",
           b.payment_method AS "paymentMethod", b.notes_player AS "notesPlayer",
           b.notes_internal AS "notesInternal", b.guest_name AS "guestName", b.guest_phone AS "guestPhone",
           b.canceled_reason AS "canceledReason",
           c.name AS "courtName",
           CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
           p.phone AS "playerPhone"
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.tenant_id = ${tenantId} AND b.id = ${bookingId}
    LIMIT 1
  `)
  const list = rows as unknown as ReservaDetail[]
  return list[0] ?? null
}
