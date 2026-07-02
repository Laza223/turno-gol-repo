import type PgBoss from 'pg-boss'
import { getWorkerDb } from '@/shared/db/client'
import { autoCompleteOverdueBookings } from '@/modules/bookings/booking.service'
import { QUEUE_AUTO_COMPLETE } from '../definitions'
import { logger } from '@/shared/lib/logger'

async function runAutoCompleteBookings(): Promise<void> {
  // Bulk UPDATE across every tenant's confirmed bookings — can't be scoped to
  // one app.current_tenant_id, needs the service-role pool (Fable 5 P0).
  const db = getWorkerDb()
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
