import { getWorkerSql } from '@/shared/db/client'
import { sendPushNotification } from '@/lib/web-push'
import { logger } from '@/shared/lib/logger'
import type { StaffNotificationContent } from './staff-notification.types'
import { createPushReceiptToken } from './push-receipt.service'
import { quietHoursReleaseAt } from './push-quiet-hours'

/** Claim con lease: un crash antes de enviar se puede retomar, sin perder la intención. */
export async function sendStaffPushDelivery(
  notificationId: string,
  deliveryId: string,
  subscriptionId: string,
): Promise<void> {
  const sql = getWorkerSql()
  const rows = await sql<
    {
      content: StaffNotificationContent
      expires_at: Date
      endpoint: string
      p256dh_key: string
      auth_key: string
      attempt_count: number
      tenant_id: string
      timezone: string
    }[]
  >`
    UPDATE push_send_log d SET status = 'sending', lease_until = now() + interval '1 minute', attempt_count = d.attempt_count + 1
    FROM notifications n, push_subscriptions ps, tenant_staff_members tsm, tenants t
    WHERE d.dedupe_key = ${deliveryId} AND d.notification_id = ${notificationId} AND d.subscription_id = ${subscriptionId}
      AND n.id = d.notification_id AND n.channel = 'push' AND n.status IN ('queued','sending')
      AND t.id = n.tenant_id
      AND n.available_at <= now() AND n.expires_at > now()
      AND ps.id = d.subscription_id AND ps.tenant_id = n.tenant_id AND ps.staff_user_id = n.recipient_id
      AND tsm.tenant_id = n.tenant_id AND tsm.staff_user_id = n.recipient_id AND tsm.is_active = true
      AND (n.content->>'audience' <> 'owners' OR tsm.role = 'admin')
      AND d.next_attempt_at <= now() AND d.attempt_count < 4 AND d.accepted_at IS NULL AND d.processed_at IS NULL
      AND (d.status = 'queued' OR (d.status = 'sending' AND d.lease_until < now()))
    RETURNING n.content,n.expires_at,n.tenant_id,t.timezone,ps.endpoint,ps.p256dh_key,ps.auth_key,d.attempt_count
  `
  const row = rows[0]
  if (!row) return
  // Un retry o backlog de anoche también respeta silencio, no sólo el enqueue.
  const quietUntil =
    row.content.payload.type === 'test'
      ? null
      : quietHoursReleaseAt(new Date(), row.timezone ?? 'America/Argentina/Buenos_Aires')
  if (quietUntil) {
    await sql`UPDATE push_send_log SET status = 'queued', lease_until = NULL,
      next_attempt_at = ${quietUntil}, attempt_count = greatest(0, attempt_count - 1)
      WHERE dedupe_key = ${deliveryId} AND accepted_at IS NULL AND processed_at IS NULL`
    await sql`UPDATE notifications SET available_at = greatest(available_at, ${quietUntil})
      WHERE id = ${notificationId}`
    return
  }
  try {
    const expiresAt = new Date(row.expires_at)
    const result = await sendPushNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh_key, auth: row.auth_key } },
      {
        ...row.content.payload,
        eventId: notificationId,
        deliveryId,
        receiptToken: createPushReceiptToken(deliveryId, expiresAt),
        receiptUrl: '/api/public/push/receipt',
        expiresAt: expiresAt.toISOString(),
      },
    )
    if (result.success) {
      await sql`UPDATE push_send_log SET status = CASE WHEN opened_at IS NOT NULL THEN 'opened' WHEN processed_at IS NOT NULL THEN 'processed' ELSE 'accepted' END,
        accepted_at = coalesce(accepted_at,now()), lease_until = NULL,last_error = NULL WHERE dedupe_key = ${deliveryId}`
      await sql`UPDATE push_subscriptions SET last_used_at = now() WHERE id = ${subscriptionId}`
      logger.info('staff push accepted', {
        module: 'staff-notifications',
        tenantId: row.tenant_id,
        type: row.content.payload.type,
        notificationId,
      })
      return
    }
    const terminal =
      result.gone ||
      (result.statusCode >= 400 && result.statusCode < 500 && result.statusCode !== 429) ||
      row.attempt_count >= 4
    await sql`UPDATE push_send_log SET status = CASE WHEN processed_at IS NOT NULL THEN status ELSE ${terminal ? 'failed' : 'queued'} END,
      lease_until = NULL,next_attempt_at = now() + (${30 * 2 ** (row.attempt_count - 1)} * interval '1 second'),
      last_error = ${`provider_status:${result.statusCode}`} WHERE dedupe_key = ${deliveryId}`
    if (result.gone) await sql`DELETE FROM push_subscriptions WHERE id = ${subscriptionId}`
    if (terminal)
      logger.error('staff push delivery failed', {
        module: 'staff-notifications',
        notificationId,
        tenantId: row.tenant_id,
        type: row.content.payload.type,
        statusCode: result.statusCode,
      })
  } catch (err) {
    // El siguiente barrido retoma; no se registra como aceptado un envío sin respuesta.
    await sql`UPDATE push_send_log SET status = CASE WHEN processed_at IS NOT NULL THEN status ELSE ${row.attempt_count >= 4 ? 'failed' : 'queued'} END,
      lease_until = NULL,next_attempt_at = now() + interval '30 seconds',last_error = 'send_interrupted'
      WHERE dedupe_key = ${deliveryId} AND accepted_at IS NULL`
    throw err
  }
}
