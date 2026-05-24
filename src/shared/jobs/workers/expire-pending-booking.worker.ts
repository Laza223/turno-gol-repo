import type PgBoss from 'pg-boss'
import {
  QUEUE_EXPIRE_PENDING_BOOKING,
  QUEUE_EXPIRE_PENDING_BOOKING_SWEEP,
  type ExpirePendingBookingJobData,
} from '../definitions'
import {
  expirePendingBookingWithPolicy,
  sweepExpiredPendingBookings,
} from '@/modules/bookings/booking.expiry'

/**
 * Registers the pending_payment expiry consumer (Hallazgo 1 + 2):
 *   - per-booking job armed 15min after creation by `scheduleBookingExpiry`
 *     (re-armed to 48h when an in_process transfer is detected);
 *   - a 5-minute sweep cron as a safety net for jobs that never ran.
 */
export async function registerExpirePendingBookingWorker(
  boss: PgBoss,
): Promise<void> {
  await boss.work<ExpirePendingBookingJobData>(
    QUEUE_EXPIRE_PENDING_BOOKING,
    async (job) => {
      const j = Array.isArray(job) ? job[0] : job
      const bookingId = j?.data?.bookingId
      if (!bookingId) return
      await expirePendingBookingWithPolicy(bookingId)
    },
  )

  await boss.schedule(QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, '*/5 * * * *', {})
  await boss.work(QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, async () => {
    await sweepExpiredPendingBookings()
  })

  console.log(`[workers] registered ${QUEUE_EXPIRE_PENDING_BOOKING}`)
}
