import type PgBoss from 'pg-boss'
import { getSql, getDb } from '@/shared/db/client'
import { QUEUE_BOOKING_REMINDER, type BookingReminderJobData } from '../definitions'
import {
  enqueueNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { logger } from '@/shared/lib/logger'

export async function processBookingReminderJob(
  job: PgBoss.Job<BookingReminderJobData>,
): Promise<void> {
  const { booking_id, player_id } = job.data

  const sql = getSql()
  const rows = await sql<{
    court_name: string
    date: string
    time_start: string
    time_end: string
    tenant_name: string
    tenant_address: string
    player_first_name: string
    tenant_id: string
  }[]>`
    SELECT
      c.name   AS court_name,
      b.date::text AS date,
      b.time_start::text AS time_start,
      b.time_end::text AS time_end,
      t.name   AS tenant_name,
      t.address AS tenant_address,
      p.first_name AS player_first_name,
      b.tenant_id AS tenant_id
    FROM bookings b
    JOIN courts  c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    JOIN players p ON p.id = b.player_id
    WHERE b.id = ${booking_id}
      AND b.status = 'confirmed'
      AND b.player_id = ${player_id}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) {
    // Booking canceled or not found — skip silently
    return
  }

  const dateFormatted = row.date.slice(0, 10).split('-').reverse().join('/')
  const content = {
    playerFirstName: row.player_first_name,
    courtName: row.court_name,
    date: dateFormatted,
    timeStart: row.time_start.slice(0, 5),
    timeEnd: row.time_end.slice(0, 5),
    tenantName: row.tenant_name,
    tenantAddress: row.tenant_address,
  }

  const db = getDb()
  let notifId: string | undefined
  await db.transaction(async (tx) => {
    notifId = await enqueueNotification(
      {
        tenantId: row.tenant_id,
        recipientType: 'player',
        recipientId: player_id,
        templateName: 'booking_reminder',
        content,
        triggerEvent: 'booking.reminder_24h',
      },
      tx,
    )
  })

  if (notifId) {
    await dispatchEmail(notifId)
  }
}

export async function registerBookingReminderWorker(boss: PgBoss): Promise<void> {
  await boss.work<BookingReminderJobData>(QUEUE_BOOKING_REMINDER, async (job) => {
    const j = Array.isArray(job) ? job[0] : job
    if (!j) return
    await processBookingReminderJob(j)
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_BOOKING_REMINDER })
}
