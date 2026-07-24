import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'

export type DebtRow = {
  id: string
  date: string
  timeStart: string
  timeEnd: string
  startsAt: string
  endsAt: string
  courtName: string
  playerId: string | null
  playerName: string | null
  playerPhone: string | null
  guestName: string | null
  guestPhone: string | null
  contactName: string | null
  contactPhone: string | null
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  chargesTotal: number
  depositCounted: number
  totalPaid: number
  pending: number
  notesInternal: string | null
  completedByStaff: string | null
  completedByStaffName: string | null
}

export async function getDebts(tenantId: string, tx: DbTx): Promise<DebtRow[]> {
  const rows = await tx.execute(sql`
    SELECT 
      b.id,
      b.date::text AS "date",
      b.time_start::text AS "timeStart",
      b.time_end::text AS "timeEnd",
      b.starts_at::text AS "startsAt",
      b.ends_at::text AS "endsAt",
      c.name AS "courtName",
      b.player_id AS "playerId",
      CASE WHEN p.id IS NULL THEN NULL ELSE (p.first_name || ' ' || p.last_name) END AS "playerName",
      p.phone AS "playerPhone",
      b.guest_name AS "guestName",
      b.guest_phone AS "guestPhone",
      b.price_snapshot AS "priceSnapshot",
      b.deposit_amount AS "depositAmount",
      b.deposit_status AS "depositStatus",
      b.notes_internal AS "notesInternal",
      b.completed_by_staff AS "completedByStaff",
      CASE WHEN su.id IS NULL THEN NULL ELSE (su.first_name || ' ' || su.last_name) END AS "completedByStaffName",
      COALESCE(
        SUM(cf.amount) FILTER (
          WHERE cf.type = 'income'
            AND cf.category = 'booking'
            AND cf.description <> ('Seña — turno ' || b.id::text)
        ), 0
      )::int AS "chargesTotal"
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    LEFT JOIN players p ON b.player_id = p.id
    LEFT JOIN staff_users su ON b.completed_by_staff = su.id
    LEFT JOIN cash_flows cf ON cf.booking_id = b.id AND cf.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId}
      AND b.status = 'completed'
    GROUP BY b.id, c.name, b.player_id, p.id, p.first_name, p.last_name, p.phone, su.id, su.first_name, su.last_name
    HAVING (
      b.price_snapshot - (
        CASE WHEN b.deposit_status IN ('paid', 'captured') THEN b.deposit_amount ELSE 0 END
      ) - COALESCE(
        SUM(cf.amount) FILTER (
          WHERE cf.type = 'income'
            AND cf.category = 'booking'
            AND cf.description <> ('Seña — turno ' || b.id::text)
        ), 0
      )
    ) > 0
    ORDER BY b.date DESC, b.time_start DESC
  `)

  return (rows as unknown as Array<{
    id: string
    date: string
    timeStart: string
    timeEnd: string
    startsAt: string
    endsAt: string
    courtName: string
    playerId: string | null
    playerName: string | null
    playerPhone: string | null
    guestName: string | null
    guestPhone: string | null
    priceSnapshot: number
    depositAmount: number
    depositStatus: string
    notesInternal: string | null
    completedByStaff: string | null
    completedByStaffName: string | null
    chargesTotal: number
  }>).map((r) => {
    const contactName = r.guestName || r.playerName || null
    const contactPhone = r.guestPhone || r.playerPhone || null
    const { depositCounted, totalPaid, pending } = summarizeBookingCharges({
      priceSnapshot: r.priceSnapshot,
      depositAmount: r.depositAmount,
      depositStatus: r.depositStatus,
      chargesTotal: r.chargesTotal,
    })

    return {
      ...r,
      contactName,
      contactPhone,
      depositCounted,
      totalPaid,
      pending,
    }
  })
}
