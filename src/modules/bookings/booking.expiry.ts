import { getSql, getDb } from '@/shared/db/client'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'
import { scheduleBookingExpiry } from '@/shared/jobs/schedule-expiry'
import {
  enqueueNotification,
  enqueueTenantOwnerNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { expirePendingBooking } from './booking.service'
import { logger } from '@/shared/lib/logger'

/**
 * Outcome of evaluating one pending_payment booking against the expiry policy.
 *  - `expired`     → slot freed (race-safe transition won).
 *  - `rescheduled` → still within its window (or a transfer is in_process); a new
 *                    timer was armed, the booking was NOT touched.
 *  - `skipped`     → not found, or already left pending_payment.
 */
export type ExpiryAction = 'expired' | 'rescheduled' | 'skipped'

type ExpiryState = {
  status: string
  createdAt: Date
  tenantId: string
  playerId: string | null
  date: string
  timeStart: string
  courtName: string
  tenantName: string
  playerFirstName: string | null
  hasInProcess: boolean
}

async function loadExpiryState(bookingId: string): Promise<ExpiryState | null> {
  const dbSql = getSql()
  const rows = await dbSql<
    {
      status: string
      createdAt: Date
      tenantId: string
      playerId: string | null
      date: string
      timeStart: string
      courtName: string
      tenantName: string
      playerFirstName: string | null
      hasInProcess: boolean
    }[]
  >`
    SELECT
      b.status,
      b.created_at AS "createdAt",
      b.tenant_id  AS "tenantId",
      b.player_id  AS "playerId",
      b.date::text AS date,
      b.time_start::text AS "timeStart",
      c.name AS "courtName",
      t.name AS "tenantName",
      p.first_name AS "playerFirstName",
      EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.booking_id = b.id AND pay.status = 'in_process'
      ) AS "hasInProcess"
    FROM bookings b
    JOIN courts  c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `
  return rows[0] ?? null
}

function fmtDate(date: string): string {
  return date.slice(0, 10).split('-').reverse().join('/')
}

/**
 * Evaluate a single pending_payment booking and expire it when its 6 min window
 * has elapsed (Hallazgo 1). While still inside the window the job is re-armed and
 * the booking is left untouched.
 */
export async function expirePendingBookingWithPolicy(
  bookingId: string,
): Promise<ExpiryAction> {
  const state = await loadExpiryState(bookingId)
  if (!state || state.status !== 'pending_payment') return 'skipped'

  const cutoffSeconds = DEFAULT_EXPIRY_SECONDS
  const elapsedSeconds = (Date.now() - new Date(state.createdAt).getTime()) / 1000

  if (elapsedSeconds < cutoffSeconds) {
    // Not due yet — the timer fired early. Re-arm for the remaining time; do NOT expire.
    await scheduleBookingExpiry(bookingId, cutoffSeconds - elapsedSeconds)
    return 'rescheduled'
  }

  const db = getDb()
  const dateFmt = fmtDate(state.date)
  const timeStartFmt = state.timeStart.slice(0, 5)
  const notifIds: string[] = []

  const won = await db.transaction(async (tx) => {
    const result = await expirePendingBooking(bookingId, tx)
    if (!result.won) return false

    if (state.playerId) {
      const id = await enqueueNotification(
        {
          tenantId: state.tenantId,
          recipientType: 'player',
          recipientId: state.playerId,
          templateName: 'deposit_expired',
          content: {
            playerFirstName: state.playerFirstName ?? '',
            courtName: state.courtName,
            date: dateFmt,
            timeStart: timeStartFmt,
            tenantName: state.tenantName,
          },
          triggerEvent: 'booking.expired',
        },
        tx,
      )
      notifIds.push(id)
    }

    if (state.hasInProcess) {
      // 48h transfer never settled — alert the admin (slot was freed).
      const adminIds = await enqueueTenantOwnerNotification(
        {
          tenantId: state.tenantId,
          templateName: 'admin_transfer_expired',
          content: {
            courtName: state.courtName,
            date: dateFmt,
            timeStart: timeStartFmt,
            bookingId,
          },
          triggerEvent: 'booking.transfer_expired',
        },
        tx,
      )
      notifIds.push(...adminIds)
    }

    return true
  })

  if (!won) return 'skipped'

  for (const id of notifIds) {
    await dispatchEmail(id)
  }
  return 'expired'
}


/**
 * Safety net (Hallazgo 1): sweep every pending_payment booking past its 6 min
 * window in case the per-booking pg-boss job never ran. Each one goes through the
 * same race-safe policy, so overlap with a live job is harmless.
 */
export async function sweepExpiredPendingBookings(): Promise<number> {
  const dbSql = getSql()
  const rows = await dbSql<{ id: string }[]>`
    SELECT b.id
    FROM bookings b
    WHERE b.status = 'pending_payment'
      AND b.created_at < NOW() - (${DEFAULT_EXPIRY_SECONDS} * INTERVAL '1 second')
    ORDER BY b.created_at ASC
    LIMIT 500
  `

  let expired = 0
  for (const row of rows) {
    const action = await expirePendingBookingWithPolicy(row.id)
    if (action === 'expired') expired += 1
  }
  if (expired > 0) {
    logger.info('sweep expired bookings', { module: 'expire-pending-booking-sweep', count: expired })
  }
  return expired
}
