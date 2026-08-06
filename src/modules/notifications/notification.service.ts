import { and, eq, inArray, sql as drizzleSql } from 'drizzle-orm'
import { notifications } from '@/shared/db/schema'
import { getWorkerSql, getWorkerDb } from '@/shared/db/client'
import type { DbTx } from '@/shared/db/client'
import { getBoss } from '@/shared/jobs/boss'
import {
  QUEUE_SEND_EMAIL,
  SEND_EMAIL_SEND_OPTIONS,
  type SendEmailJobData,
} from '@/shared/jobs/definitions'
import type { StaffRole } from '@/modules/staff/roles'
import type { TemplateName } from './templates'

export type EnqueueNotificationParams = {
  tenantId: string | null
  recipientType: 'player' | 'staff' | 'tenant_owner'
  recipientId: string
  templateName: TemplateName
  content: Record<string, unknown>
  triggerEvent: string
}

export type NotificationRow = {
  id: string
  tenantId: string | null
  recipientType: string
  recipientId: string
  channel: string
  triggerEvent: string
  status: string
  content: unknown
  templateName: string | null
  attemptCount: number
  lastError: string | null
  queuedAt: Date
  sentAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
}

/**
 * INSERT notification inside the caller's Drizzle tx (atomic with the business op).
 * Returns the new notification ID.
 * Call dispatchEmail(id) AFTER the tx commits.
 */
export async function enqueueNotification(
  params: EnqueueNotificationParams,
  tx: DbTx,
): Promise<string> {
  const inserted = await tx
    .insert(notifications)
    .values({
      tenantId: params.tenantId,
      recipientType: params.recipientType,
      recipientId: params.recipientId,
      channel: 'email',
      triggerEvent: params.triggerEvent,
      status: 'queued',
      content: params.content,
      templateName: params.templateName,
    })
    .returning({ id: notifications.id })

  return inserted[0]!.id
}

/**
 * Enqueue `admin_new_booking` (or similar) for all active staff in a tenant.
 * Queries tenant_staff_members inside the tx (tenant context already set by caller).
 * Silently skips if no active staff found.
 *
 * Returns the inserted notification IDs so the caller can `dispatchEmail` each
 * one AFTER the tx commits.
 *
 * `opts.onlyRole` acota el envío a un rol. Sin ese filtro esta función manda a
 * TODO el staff activo, pese al prefijo `admin_` de casi todos sus templates —
 * o sea, hasta ahora "admin" venía significando "el complejo", no el rol. Se
 * agregó opcional en vez de cambiar el default para no reinterpretar de golpe
 * los 10 callers existentes: el único que lo usa hoy es la alerta de reembolso
 * externo de MP, que es plata y facturación, exactamente lo que
 * `requireAdminStaffAction` le cierra al encargado en el resto de la app.
 */
export async function enqueueTenantOwnerNotification(
  params: Omit<EnqueueNotificationParams, 'recipientType' | 'recipientId'> & {
    tenantId: string
  },
  tx: DbTx,
  opts?: { onlyRole?: StaffRole },
): Promise<string[]> {
  const roleFilter = opts?.onlyRole
    ? drizzleSql`AND tsm.role = ${opts.onlyRole}`
    : drizzleSql``
  const rows = await tx.execute(
    drizzleSql`
      SELECT tsm.staff_user_id AS id
      FROM tenant_staff_members tsm
      WHERE tsm.tenant_id = ${params.tenantId}
        AND tsm.is_active = true
        ${roleFilter}
      LIMIT 5
    `,
  ) as unknown as Array<{ id: string }>

  const ids: string[] = []
  for (const row of rows) {
    const id = await enqueueNotification(
      { ...params, recipientType: 'tenant_owner', recipientId: row.id },
      tx,
    )
    ids.push(id)
  }
  return ids
}

/**
 * Enqueue a pg-boss send-email job for a notification.
 * Must be called AFTER the tx that inserted the notification has committed.
 */
export async function dispatchEmail(notificationId: string): Promise<void> {
  const boss = await getBoss()
  const data: SendEmailJobData = { notification_id: notificationId }
  await boss.send(QUEUE_SEND_EMAIL, data, SEND_EMAIL_SEND_OPTIONS)
}

// ─── Worker helpers (getWorkerSql()/getWorkerDb() → service-role, no RLS) ──────

export async function getNotificationById(id: string): Promise<NotificationRow | null> {
  const db = getWorkerDb()
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, id))
    .limit(1)
  return (rows[0] as NotificationRow | undefined) ?? null
}

/**
 * Atomic pre-send claim. Returns true if THIS caller acquired the right to
 * dispatch the email (the row was queued and we successfully advanced its
 * attempt_count). Returns false if another worker already claimed it, the
 * notification is already sent/failed, or attempt_count moved on between the
 * caller's SELECT and this UPDATE.
 *
 * Prevents duplicate sends when multiple sweep workers (or a redeploy overlap)
 * pick up the same queued notification — Resend has no per-recipient dedup, so
 * without this lock a crashed/restarted worker can spam the same email.
 */
export async function claimNotificationForSend(
  id: string,
  expectedAttemptCount: number,
): Promise<boolean> {
  const sql = getWorkerSql()
  const rows = await sql<{ id: string }[]>`
    UPDATE notifications
    SET status = 'sending', attempt_count = attempt_count + 1
    WHERE id = ${id}
      AND status = 'queued'
      AND attempt_count = ${expectedAttemptCount}
    RETURNING id
  `
  return rows.length > 0
}

export async function markNotificationSent(id: string): Promise<void> {
  const db = getWorkerDb()
  await db
    .update(notifications)
    .set({ status: 'sent', sentAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.status, 'sending')))
}

export async function markNotificationFailed(id: string, error: string): Promise<void> {
  const db = getWorkerDb()
  await db
    .update(notifications)
    .set({ status: 'failed', lastError: error })
    .where(and(eq(notifications.id, id), inArray(notifications.status, ['queued', 'sending'])))
}

export async function updateNotificationLastError(
  id: string,
  error: string,
  newAttemptCount: number,
): Promise<void> {
  const db = getWorkerDb()
  await db
    .update(notifications)
    .set({ status: 'queued', lastError: error, attemptCount: newAttemptCount })
    .where(and(eq(notifications.id, id), eq(notifications.status, 'sending')))
}

export async function resolveRecipientEmail(
  recipientType: 'player' | 'staff' | 'tenant_owner',
  recipientId: string,
  tenantId: string | null,
): Promise<string> {
  const sql = getWorkerSql()

  if (recipientType === 'player') {
    const rows = await sql<{ email: string }[]>`
      SELECT email FROM players WHERE id = ${recipientId} LIMIT 1
    `
    if (!rows[0]) throw new Error(`Player ${recipientId} not found`)
    return rows[0].email
  }

  if (recipientType === 'staff') {
    const rows = await sql<{ email: string }[]>`
      SELECT email FROM staff_users WHERE id = ${recipientId} LIMIT 1
    `
    if (!rows[0]) throw new Error(`Staff user ${recipientId} not found`)
    return rows[0].email
  }

  // tenant_owner: recipientId is staff_user_id verified in tenant_staff_members
  if (!tenantId) throw new Error('tenant_owner notification requires tenantId')
  const rows = await sql<{ email: string }[]>`
    SELECT s.email
    FROM staff_users s
    JOIN tenant_staff_members tsm ON tsm.staff_user_id = s.id
    WHERE tsm.staff_user_id = ${recipientId}
      AND tsm.tenant_id = ${tenantId}
      AND tsm.is_active = true
    LIMIT 1
  `
  if (!rows[0]) throw new Error(`Tenant owner ${recipientId} not found for tenant ${tenantId}`)
  return rows[0].email
}
