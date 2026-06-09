import type PgBoss from 'pg-boss'
import { getDb } from '@/shared/db/client'
import { autoCompleteOverdueBookings } from '@/modules/bookings/booking.service'
import { QUEUE_AUTO_COMPLETE } from '../definitions'
import { logger } from '@/shared/lib/logger'

export async function runAutoCompleteBookings(): Promise<void> {
  const db = getDb()
  const completed = await db.transaction(async (tx) => {
    return autoCompleteOverdueBookings(tx)
  })

  if (completed.length > 0) {
    logger.info('completed bookings', { module: 'auto-complete-bookings', count: completed.length })
  }
}

export async function registerAutoCompleteBookingsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_AUTO_COMPLETE, '*/30 * * * *', {})
  await boss.work(QUEUE_AUTO_COMPLETE, async () => {
    await runAutoCompleteBookings()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_AUTO_COMPLETE })
}
