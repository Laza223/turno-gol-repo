import type PgBoss from 'pg-boss'
import {
  CRON_WORK_OPTIONS,
  QUEUE_EXPIRE_PENDING_BOOKING,
  QUEUE_EXPIRE_PENDING_BOOKING_SWEEP,
  type ExpirePendingBookingJobData,
} from '../definitions'
import {
  expirePendingBookingWithPolicy,
  sweepExpiredPendingBookings,
} from '@/modules/bookings/booking.expiry'
import { logger } from '@/shared/lib/logger'

/**
 * Registers the pending_payment expiry consumer (Hallazgo 1 + 2):
 *   - per-booking job armed DEFAULT_EXPIRY_SECONDS (6min) after creation by
 *     `scheduleBookingExpiry` (re-armed to 48h when an in_process transfer is detected);
 *   - a 5-minute sweep cron as a safety net for jobs that never ran.
 */
export async function registerExpirePendingBookingWorker(boss: PgBoss): Promise<void> {
  await boss.work<ExpirePendingBookingJobData>(QUEUE_EXPIRE_PENDING_BOOKING, async (job) => {
    const j = Array.isArray(job) ? job[0] : job
    const bookingId = j?.data?.bookingId
    if (!bookingId) return
    await expirePendingBookingWithPolicy(bookingId)
  })

  await boss.schedule(QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, '*/5 * * * *', {})
  await boss.work(QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, CRON_WORK_OPTIONS, async () => {
    await sweepExpiredPendingBookings()
  })

  logger.info('registered queue', { module: 'workers', queue: QUEUE_EXPIRE_PENDING_BOOKING })
}
