import { auditLogs } from '@/shared/db/schema'
import type { DbTx } from './client'

/** Sentinel UUID for system-originated audit rows (cron jobs, webhooks). */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

export type AuditEntry = {
  tenantId: string
  actorId: string
  actorType: 'player' | 'staff' | 'system'
  /** Format: `<resource>.<verb>` — e.g. 'booking.canceled'. */
  action: string
  resourceType: string
  resourceId: string
  metadata?: Record<string, unknown>
}

export async function insertAuditLog(
  tx: DbTx,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorId: entry.actorId,
    actorType: entry.actorType,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata ?? null,
  })
}

export type SystemAuditEntry = Omit<AuditEntry, 'actorId' | 'actorType'>

export async function insertSystemAuditLog(
  tx: DbTx,
  entry: SystemAuditEntry,
): Promise<void> {
  await insertAuditLog(tx, {
    ...entry,
    actorId: SYSTEM_ACTOR_ID,
    actorType: 'system',
  })
}
