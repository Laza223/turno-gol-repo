import type PgBoss from 'pg-boss'
import { getDb } from '@/shared/db/client'
import { autoCompleteOverdueBookings } from '@/modules/bookings/booking.service'
import { QUEUE_AUTO_COMPLETE } from '../definitions'

export async function runAutoCompleteBookings(): Promise<void> {
  const db = getDb()
  const completed = await db.transaction(async (tx) => {
    return autoCompleteOverdueBookings(tx)
  })

  if (completed.length > 0) {
    console.log(`[auto-complete-bookings] completed ${completed.length} bookings`)
  }
}

export async function registerAutoCompleteBookingsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_AUTO_COMPLETE, '*/30 * * * *', {})
  await boss.work(QUEUE_AUTO_COMPLETE, async () => {
    await runAutoCompleteBookings()
  })
  console.log(`[workers] registered ${QUEUE_AUTO_COMPLETE}`)
}
