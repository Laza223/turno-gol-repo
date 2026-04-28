import { auditLogs } from '@/shared/db/schema'
import type { DbTx } from './client'

/**
 * Sentinel UUID for `actor_type='system'` rows in `audit_logs`. The schema
 * requires `actor_id NOT NULL`, but cron jobs / webhook handlers don't have a
 * real user. Using a fixed UUID keeps the column type consistent and makes
 * system-originated rows trivially queryable.
 */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

export type SystemAuditEntry = {
  tenantId: string
  /** Format: `<resource>.<verb>` — e.g. 'booking.late_payment_attempt'. */
  action: string
  resourceType: string
  resourceId: string
  metadata?: Record<string, unknown>
}

export async function insertSystemAuditLog(
  tx: DbTx,
  entry: SystemAuditEntry,
): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorId: SYSTEM_ACTOR_ID,
    actorType: 'system',
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata ?? null,
  })
}
