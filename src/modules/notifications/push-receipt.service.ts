import { createHmac, timingSafeEqual } from 'node:crypto'
import { getWorkerSql } from '@/shared/db/client'
import { logger } from '@/shared/lib/logger'

function receiptSignature(deliveryId: string, expires: string): string {
  const secret = process.env.PUSH_RECEIPT_SECRET
  if (!secret || secret.length < 32)
    throw new Error('PUSH_RECEIPT_SECRET must have at least 32 characters')
  return createHmac('sha256', secret)
    .update(`push-receipt:v1:${deliveryId}:${expires}`)
    .digest('base64url')
}

export function createPushReceiptToken(deliveryId: string, expiresAt: Date): string {
  const expires = String(expiresAt.getTime())
  return `${expires}.${receiptSignature(deliveryId, expires)}`
}

export function verifyPushReceiptToken(deliveryId: string, token: string): boolean {
  const [expires, signature, extra] = token.split('.')
  if (!expires || !signature || extra || !/^\d+$/.test(expires)) return false
  if (!Number.isSafeInteger(Number(expires)) || Number(expires) <= Date.now()) return false
  try {
    const expected = Buffer.from(receiptSignature(deliveryId, expires))
    const actual = Buffer.from(signature)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export async function recordPushReceipt(
  deliveryId: string,
  token: string,
  stage: 'processed' | 'opened',
): Promise<boolean> {
  if (!verifyPushReceiptToken(deliveryId, token)) return false
  const sql = getWorkerSql()
  const rows = await sql<
    { dedupe_key: string; notification_id: string; tenant_id: string; trigger_event: string }[]
  >`
    UPDATE push_send_log d
    SET processed_at = coalesce(processed_at, now()),
        opened_at = CASE WHEN ${stage} = 'opened' THEN coalesce(opened_at, now()) ELSE opened_at END,
        status = CASE WHEN ${stage} = 'opened' OR opened_at IS NOT NULL THEN 'opened' ELSE 'processed' END
    FROM notifications n
    WHERE d.dedupe_key = ${deliveryId} AND d.notification_id = n.id
    RETURNING d.dedupe_key,d.notification_id,n.tenant_id,n.trigger_event
  `
  if (rows[0])
    logger.info('staff push receipt', {
      module: 'staff-notifications',
      tenantId: rows[0].tenant_id,
      type: rows[0].trigger_event,
      notificationId: rows[0].notification_id,
      stage,
    })
  return rows.length > 0
}
