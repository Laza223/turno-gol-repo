import type PgBoss from 'pg-boss'
import { getSql } from '@/shared/db/client'
import { QUEUE_SEND_EMAIL } from '../definitions'
import {
  claimNotificationForSend,
  getNotificationById,
  markNotificationSent,
  markNotificationFailed,
  updateNotificationLastError,
  resolveRecipientEmail,
  type NotificationRow,
} from '@/modules/notifications/notification.service'
import { getEmailProvider } from '@/modules/notifications/email.provider'
import { renderTemplate, isTemplateName } from '@/modules/notifications/templates'
import { logger } from '@/shared/lib/logger'

/**
 * Process a single notification. Exported for direct use in tests and
 * the booking-reminder worker (which enqueues from within the worker process).
 */
export async function processSingleNotification(notif: NotificationRow): Promise<void> {
  if (notif.status === 'sent') return

  const MAX_ATTEMPTS = 3

  // Atomic pre-send claim. Prevents duplicate dispatches when multiple sweep
  // workers race on the same queued row (Resend has no recipient-level dedup).
  const claimed = await claimNotificationForSend(notif.id, notif.attemptCount)
  if (!claimed) return

  // Effective attempt number (claim incremented the counter).
  const thisAttempt = notif.attemptCount + 1
  const isLastAttempt = thisAttempt >= MAX_ATTEMPTS

  try {
    if (!notif.templateName || !isTemplateName(notif.templateName)) {
      throw new Error(`Unknown template: ${notif.templateName}`)
    }
    const email = await resolveRecipientEmail(
      notif.recipientType as 'player' | 'staff' | 'tenant_owner',
      notif.recipientId,
      notif.tenantId,
    )
    const rendered = renderTemplate(notif.templateName, notif.content)
    await getEmailProvider().send({ to: email, ...rendered })
    await markNotificationSent(notif.id)
    // PII scrub (B9 Ley 25.326): never log recipient email to stdout.
    // Vercel/Sentry retain logs; the notification id is sufficient to trace
    // back to the row (recipient_type + recipient_id, RLS-protected).
    logger.info('sent notification', { module: 'send-email', notificationId: notif.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('failed notification', { module: 'send-email', notificationId: notif.id, attempt: thisAttempt, maxAttempts: MAX_ATTEMPTS, error: msg })
    if (isLastAttempt) {
      await markNotificationFailed(notif.id, msg)
      return
    }
    // Reset to 'queued' so the next cron sweep retries — claim already bumped
    // attempt_count, lastError records the failure detail.
    await updateNotificationLastError(notif.id, msg, thisAttempt)
    throw err
  }
}

/**
 * Sweep all queued notifications and send them.
 * Called by the cron worker. Also usable in integration tests.
 */
export async function processQueuedNotifications(): Promise<void> {
  const sql = getSql()
  // Fetch up to 50 queued notifications (attempt_count ≤ 3 → includes final attempt)
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM notifications
    WHERE status = 'queued'
      AND attempt_count <= 3
    ORDER BY queued_at
    LIMIT 50
  `
  for (const { id } of rows) {
    const notif = await getNotificationById(id)
    if (!notif) continue
    try {
      await processSingleNotification(notif)
    } catch {
      // Error already logged + lastError updated in processSingleNotification.
      // Continue with remaining notifications.
    }
  }
}

export async function registerSendEmailWorker(boss: PgBoss): Promise<void> {
  // Cron: every minute — sweep queued notifications.
  // Route handlers INSERT notifications (status='queued'); this worker dispatches them.
  await boss.schedule(QUEUE_SEND_EMAIL, '* * * * *', {})
  await boss.work(QUEUE_SEND_EMAIL, async () => {
    await processQueuedNotifications()
  })
  logger.info('registered queue (cron sweep)', { module: 'workers', queue: QUEUE_SEND_EMAIL })
}
