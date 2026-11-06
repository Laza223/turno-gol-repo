import { sql } from 'drizzle-orm'
import { notifications } from '@/shared/db/schema'
import { getWorkerSql, type DbTx } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import {
  QUEUE_PUSH_SEND,
  PUSH_SEND_SEND_OPTIONS,
  type PushSendJobData,
} from '@/shared/jobs/definitions'
import { logger } from '@/shared/lib/logger'
import { quietHoursReleaseAt } from './push-quiet-hours'
import {
  STAFF_NOTIFICATIONS_V2_FLAG,
  type StaffNotificationContent,
  type StaffNotificationEvent,
} from './staff-notification.types'

export async function isStaffNotificationsEnabled(tenantId: string, tx: DbTx): Promise<boolean> {
  const rows = await tx.execute(sql`
    SELECT value FROM feature_flags
    WHERE key = ${STAFF_NOTIFICATIONS_V2_FLAG}
      AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
    ORDER BY tenant_id NULLS LAST LIMIT 1
  `)
  return (rows as unknown as Array<{ value: boolean }>)[0]?.value === true
}

/** Sólo persiste intención: nunca llama al proveedor ni a pg-boss dentro de la TX. */
export async function enqueueStaffNotification(
  event: StaffNotificationEvent,
  tx: DbTx,
): Promise<string[]> {
  if (!Number.isFinite(event.expiresAt.getTime()))
    throw new Error('Invalid notification expiration')
  if (event.policy !== 'push_only' && !event.email)
    throw new Error('Email policy requires a template')
  const members = await tx.execute(sql`
    SELECT staff_user_id AS id FROM tenant_staff_members
    WHERE tenant_id = ${event.tenantId} AND is_active = true
      AND (${event.audience} <> 'owners' OR role = 'admin')
      AND (${event.recipientId ?? null}::uuid IS NULL OR staff_user_id = ${event.recipientId ?? null}::uuid)
  `)
  const zones = await tx.execute(sql`SELECT timezone FROM tenants WHERE id = ${event.tenantId}`)
  const timezone =
    (zones as unknown as Array<{ timezone: string }>)[0]?.timezone ??
    'America/Argentina/Buenos_Aires'
  const now = new Date()
  const requestedAt = new Date(Math.max(now.getTime(), event.notBefore?.getTime() ?? 0))
  const quietUntil = event.type === 'test' ? null : quietHoursReleaseAt(requestedAt, timezone)
  const availableAt = quietUntil ?? requestedAt
  const content: StaffNotificationContent = {
    payload: { ...event.payload, type: event.type },
    audience: event.audience,
    policy: event.policy,
    ...(event.email ? { email: event.email } : {}),
    ...(event.subscriptionId ? { subscriptionId: event.subscriptionId } : {}),
  }
  const ids: string[] = []
  for (const member of members as unknown as Array<{ id: string }>) {
    const inserted = await tx
      .insert(notifications)
      .values({
        tenantId: event.tenantId,
        recipientType: 'tenant_owner',
        recipientId: member.id,
        channel: 'push',
        triggerEvent: event.type,
        eventKey: event.eventKey,
        content,
        templateName: null,
        status: 'queued',
        attemptCount: 0,
        availableAt,
        expiresAt: event.expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id })
    if (inserted[0]) ids.push(inserted[0].id)
  }
  logger.info('staff notification prepared', {
    module: 'staff-notifications',
    tenantId: event.tenantId,
    type: event.type,
    eventKey: event.eventKey,
    count: ids.length,
  })
  return ids
}

type OutboxRow = {
  id: string
  tenant_id: string
  recipient_id: string
  event_key: string
  content: StaffNotificationContent
  expires_at: Date
  status: string
}

/** Todos los dispositivos se fijan bajo lock del evento; el envío ocurre después. */
async function prepareNotification(notificationId: string): Promise<PushSendJobData[]> {
  const sql = getWorkerSql()
  return sql.begin(async (tx) => {
    const rows = await tx<OutboxRow[]>`
      SELECT id, tenant_id, recipient_id, event_key, content, expires_at, status
      FROM notifications WHERE id = ${notificationId} AND channel = 'push'
        AND status IN ('queued', 'sending') AND available_at <= now() FOR UPDATE
    `
    const row = rows[0]
    if (!row) return []
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await tx`UPDATE notifications SET status = 'failed', last_error = 'expired', sending_since = NULL WHERE id = ${row.id}`
      await tx`UPDATE push_send_log SET status = 'expired', lease_until = NULL WHERE notification_id = ${row.id} AND accepted_at IS NULL AND processed_at IS NULL AND status <> 'failed'`
      return []
    }
    const members = await tx<{ id: string }[]>`
      SELECT staff_user_id AS id FROM tenant_staff_members
      WHERE tenant_id = ${row.tenant_id} AND staff_user_id = ${row.recipient_id} AND is_active = true
        AND (${row.content.audience} <> 'owners' OR role = 'admin')
    `
    if (!members.length) {
      await tx`UPDATE notifications SET status = 'failed', last_error = 'recipient_inactive', sending_since = NULL WHERE id = ${row.id}`
      await tx`UPDATE push_send_log SET status = 'failed', last_error = 'recipient_inactive', lease_until = NULL
        WHERE notification_id = ${row.id} AND status IN ('queued','sending') AND accepted_at IS NULL AND processed_at IS NULL`
      return []
    }
    const subs = await tx<{ id: string }[]>`
      SELECT id FROM push_subscriptions WHERE tenant_id = ${row.tenant_id} AND staff_user_id = ${row.recipient_id}
        AND (${row.content.subscriptionId ?? null}::uuid IS NULL OR id = ${row.content.subscriptionId ?? null}::uuid)
    `
    for (const sub of subs) {
      await tx`
        INSERT INTO push_send_log (dedupe_key, notification_id, subscription_id, status)
        VALUES (${`${row.id}:${sub.id}`}, ${row.id}, ${sub.id}, 'queued') ON CONFLICT DO NOTHING
      `
    }
    // Suscripción borrada o reasignada: no se envía a la cuenta que ahora usa ese browser.
    await tx`
      UPDATE push_send_log d SET status = 'failed', last_error = 'subscription_unavailable', lease_until = NULL
      WHERE d.notification_id = ${row.id} AND d.status IN ('queued','sending') AND d.accepted_at IS NULL
        AND d.processed_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM push_subscriptions ps WHERE ps.id = d.subscription_id
            AND ps.tenant_id = ${row.tenant_id} AND ps.staff_user_id = ${row.recipient_id}
        )
    `
    await tx`
      UPDATE push_send_log SET status = 'failed', last_error = 'retry_limit', lease_until = NULL
      WHERE notification_id = ${row.id} AND status = 'sending' AND lease_until < now()
        AND attempt_count >= 4 AND accepted_at IS NULL AND processed_at IS NULL
    `
    const deliveries = await tx<
      {
        dedupe_key: string
        subscription_id: string
        status: string
        accepted_at: Date | null
        processed_at: Date | null
      }[]
    >`
      SELECT dedupe_key, subscription_id, status, accepted_at, processed_at FROM push_send_log WHERE notification_id = ${row.id}
    `
    const accepted = deliveries.some((d) => d.accepted_at || d.processed_at)
    const pending = deliveries.some((d) => d.status === 'queued' || d.status === 'sending')
    const allFailed = deliveries.length > 0 && deliveries.every((d) => d.status === 'failed')
    const email = row.content.email
    const needsEmail =
      row.content.policy === 'email_and_push' ||
      (row.content.policy === 'push_preferred' && !accepted && (!deliveries.length || allFailed))
    if (needsEmail && email) {
      await tx`
        INSERT INTO notifications (tenant_id,recipient_type,recipient_id,channel,trigger_event,event_key,content,template_name,attempt_count,available_at,expires_at)
        VALUES (${row.tenant_id},'tenant_owner',${row.recipient_id},'email',${row.content.payload.type},${row.event_key},${tx.json(email.content as Parameters<typeof tx.json>[0])},${email.templateName},0,now(),${row.expires_at})
        ON CONFLICT DO NOTHING
      `
    }
    if (!pending) {
      await tx`UPDATE notifications SET status = ${accepted ? 'sent' : 'failed'}::notification_status,
        sent_at = CASE WHEN ${accepted} THEN now() ELSE sent_at END,
        last_error = CASE WHEN ${accepted} THEN NULL ELSE 'no_push_delivery' END, sending_since = NULL WHERE id = ${row.id}`
      logger.info('staff notification settled', {
        module: 'staff-notifications',
        tenantId: row.tenant_id,
        type: row.content.payload.type,
        notificationId: row.id,
        accepted,
        emailFallback: needsEmail,
      })
      return []
    }
    await tx`UPDATE notifications SET status = 'sending', sending_since = coalesce(sending_since, now()) WHERE id = ${row.id}`
    const ready = await tx<{ dedupe_key: string; subscription_id: string }[]>`
      SELECT dedupe_key, subscription_id FROM push_send_log
      WHERE notification_id = ${row.id} AND next_attempt_at <= now() AND attempt_count < 4
        AND (status = 'queued' OR (status = 'sending' AND lease_until < now()))
    `
    return ready.map((d) => ({
      subscription_id: d.subscription_id,
      notificationId: row.id,
      deliveryId: d.dedupe_key,
      payload: row.content.payload,
    }))
  })
}

export async function processQueuedStaffNotifications(): Promise<void> {
  const sql = getWorkerSql()
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM notifications WHERE channel = 'push' AND status IN ('queued','sending') AND available_at <= now()
    ORDER BY available_at LIMIT 100
  `
  for (const row of rows) {
    try {
      const jobs = await prepareNotification(row.id)
      if (!jobs.length) continue
      const boss = await getBoss()
      for (const job of jobs) {
        await boss.send(QUEUE_PUSH_SEND, job, PUSH_SEND_SEND_OPTIONS)
      }
    } catch (err) {
      logger.error('staff push dispatch failed', {
        module: 'staff-notifications',
        notificationId: row.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function getStaffPushDeliveryStatus(
  tenantId: string,
  staffUserId: string,
  subscriptionId: string,
  notificationId?: string,
): Promise<{ acceptedAt: string | null; processedAt: string | null; openedAt: string | null }> {
  const sql = getWorkerSql()
  const rows = await sql<
    { accepted_at: Date | null; processed_at: Date | null; opened_at: Date | null }[]
  >`
    SELECT max(d.accepted_at) AS accepted_at, max(d.processed_at) AS processed_at, max(d.opened_at) AS opened_at
    FROM push_send_log d JOIN notifications n ON n.id = d.notification_id
    JOIN push_subscriptions ps ON ps.id = d.subscription_id
    WHERE n.tenant_id = ${tenantId} AND n.recipient_id = ${staffUserId}
      AND ps.tenant_id = ${tenantId} AND ps.staff_user_id = ${staffUserId} AND ps.id = ${subscriptionId}
      AND (${notificationId ?? null}::uuid IS NULL OR n.id = ${notificationId ?? null}::uuid)
  `
  const row = rows[0]
  const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)
  return {
    acceptedAt: iso(row?.accepted_at),
    processedAt: iso(row?.processed_at),
    openedAt: iso(row?.opened_at),
  }
}

export async function getStaffNotificationHealth(): Promise<{ delayed: number; failed: number }> {
  const sql = getWorkerSql()
  const rows = await sql<{ delayed: number; failed: number }[]>`
    SELECT (SELECT count(*)::int FROM notifications WHERE channel = 'push' AND status IN ('queued','sending')
      AND available_at < now() - interval '5 minutes' AND expires_at > now()) AS delayed,
      (SELECT count(*)::int FROM push_send_log WHERE notification_id IS NOT NULL AND status = 'failed'
        AND next_attempt_at > now() - interval '1 hour' AND last_error NOT IN ('recipient_inactive','subscription_unavailable')) AS failed
  `
  return rows[0] ?? { delayed: 0, failed: 0 }
}
