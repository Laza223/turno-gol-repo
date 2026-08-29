import type PgBoss from 'pg-boss'
import { getWorkerDb } from '@/shared/db/client'
import { autoCompleteOverdueBookings } from '@/modules/bookings/booking.service'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { insertSystemAuditLogs } from '@/shared/db/audit'
import { CRON_WORK_OPTIONS, QUEUE_AUTO_COMPLETE } from '../definitions'
import { logger } from '@/shared/lib/logger'

export async function runAutoCompleteBookings(): Promise<BookingRow[]> {
  // Bulk UPDATE across every tenant's confirmed bookings — can't be scoped to
  // one app.current_tenant_id, needs the service-role pool (Fable 5 P0).
  const db = getWorkerDb()
  const completed = await db.transaction(async (tx) => {
    const rows = await autoCompleteOverdueBookings(tx)
    // doc8 US-RES-007 edge case: cada fila auto-completada por el cron deja
    // rastro de que NADIE la marcó (ni "Jugó" ni "No se presentó") —
    // actor=system, mismo patrón que expire-trials.worker.ts.
    await insertSystemAuditLogs(
      tx,
      rows.map((row) => ({
        tenantId: row.tenantId,
        action: 'booking.auto_completed',
        resourceType: 'booking',
        resourceId: row.id,
      })),
    )
    return rows
  })

  if (completed.length > 0) {
    logger.info('completed bookings', { module: 'auto-complete-bookings', count: completed.length })
  }
  return completed
}

export async function registerAutoCompleteBookingsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_AUTO_COMPLETE, '*/30 * * * *', {})
  await boss.work(QUEUE_AUTO_COMPLETE, CRON_WORK_OPTIONS, async () => {
    await runAutoCompleteBookings()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_AUTO_COMPLETE })
}
