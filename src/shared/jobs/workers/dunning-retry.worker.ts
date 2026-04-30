import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getDb, type DbTx } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import {
  transitionBlockedToChurned,
  transitionCanceledToBlocked,
  transitionPastDueToSuspended,
  transitionSuspendedToBlocked,
} from '@/modules/billing/lifecycle.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { QUEUE_DUNNING_RETRY } from '../definitions'

/**
 * Daily 13:00 ART sweep. Drives time-based escalations of the SaaS lifecycle.
 *
 * MP itself handles charge retries (day 0/2/5 cadence per doc4 §4); this sweep
 * only escalates state machine past day 7. Each per-tenant transition writes
 * an audit_log entry + enqueues a `subscription_*` notification. Pending
 * downgrades scheduled at `current_period_end` are applied here.
 */

type TenantOwnerInfo = {
  tenantId: string
  tenantName: string
  ownerName: string | null
}

async function loadTenantOwners(
  tenantIds: string[],
  tx: DbTx,
): Promise<TenantOwnerInfo[]> {
  const out: TenantOwnerInfo[] = []
  for (const id of tenantIds) {
    const rows = await tx.execute(drizzleSql`
      SELECT t.id AS "tenantId",
             t.name AS "tenantName",
             (
               SELECT su.first_name FROM tenant_staff_members tsm
               JOIN staff_users su ON su.id = tsm.staff_user_id
               WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
             ) AS "ownerName"
      FROM tenants t
      WHERE t.id = ${id}
      LIMIT 1
    `)
    const row = (rows as unknown as TenantOwnerInfo[])[0]
    if (row) out.push(row)
  }
  return out
}

function ownerName(map: Map<string, TenantOwnerInfo>, tenantId: string): string {
  return map.get(tenantId)?.ownerName ?? 'Hola'
}

function tenantName(map: Map<string, TenantOwnerInfo>, tenantId: string): string {
  return map.get(tenantId)?.tenantName ?? '(complejo)'
}

export async function runDunningSweep(): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    // ─── 1. past_due → suspended (≥ 7d) ────────────────────────────────────
    const pastDueRows = await tx.execute(drizzleSql`
      SELECT tenant_id FROM tenant_subscriptions
      WHERE status = 'past_due'
        AND dunning_started_at IS NOT NULL
        AND dunning_started_at <= NOW() - INTERVAL '7 days'
    `)
    const pastDueIds = (pastDueRows as unknown as Array<{ tenant_id: string }>).map(
      (r) => r.tenant_id,
    )

    // ─── 2. suspended → blocked (≥ 14d) ────────────────────────────────────
    const suspendedRows = await tx.execute(drizzleSql`
      SELECT tenant_id FROM tenant_subscriptions
      WHERE status = 'suspended'
        AND dunning_started_at IS NOT NULL
        AND dunning_started_at <= NOW() - INTERVAL '14 days'
    `)
    const suspendedIds = (suspendedRows as unknown as Array<{ tenant_id: string }>).map(
      (r) => r.tenant_id,
    )

    // ─── 3. blocked → churned (≥ 90d) ──────────────────────────────────────
    const blockedRows = await tx.execute(drizzleSql`
      SELECT tenant_id FROM tenant_subscriptions
      WHERE status = 'blocked'
        AND dunning_started_at IS NOT NULL
        AND dunning_started_at <= NOW() - INTERVAL '90 days'
    `)
    const blockedIds = (blockedRows as unknown as Array<{ tenant_id: string }>).map(
      (r) => r.tenant_id,
    )

    // ─── 4. canceled & period_end < NOW → blocked ──────────────────────────
    const canceledRows = await tx.execute(drizzleSql`
      SELECT tenant_id FROM tenant_subscriptions
      WHERE status = 'canceled' AND current_period_end < NOW()
    `)
    const canceledIds = (canceledRows as unknown as Array<{ tenant_id: string }>).map(
      (r) => r.tenant_id,
    )

    // ─── 5. pending_plan_change applies (downgrade) ────────────────────────
    const pendingRows = await tx.execute(drizzleSql`
      SELECT tenant_id, pending_plan_change AS "pendingPlanChange"
      FROM tenant_subscriptions
      WHERE pending_plan_change IS NOT NULL
        AND pending_change_at IS NOT NULL
        AND pending_change_at <= NOW()
        AND status = 'active'
    `)
    const pendingItems = pendingRows as unknown as Array<{
      tenant_id: string
      pendingPlanChange: string
    }>

    const dedupSet = new Set<string>()
    pastDueIds.forEach((id) => dedupSet.add(id))
    suspendedIds.forEach((id) => dedupSet.add(id))
    blockedIds.forEach((id) => dedupSet.add(id))
    canceledIds.forEach((id) => dedupSet.add(id))
    pendingItems.forEach((p) => dedupSet.add(p.tenant_id))
    const allIds: string[] = []
    dedupSet.forEach((id) => allIds.push(id))
    const owners = await loadTenantOwners(allIds, tx)
    const ownerMap = new Map(owners.map((o) => [o.tenantId, o]))

    for (const id of pastDueIds) {
      try {
        await transitionPastDueToSuspended(id, tx)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'subscription_suspended',
            triggerEvent: 'sweep.past_due_to_suspended',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
            },
          },
          tx,
        )
        console.log(`[dunning-retry] tenant ${id}: past_due → suspended`)
      } catch (err) {
        console.warn(`[dunning-retry] failed past_due→suspended for ${id}: ${String(err)}`)
      }
    }

    for (const id of suspendedIds) {
      try {
        await transitionSuspendedToBlocked(id, tx)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'subscription_blocked',
            triggerEvent: 'sweep.suspended_to_blocked',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
            },
          },
          tx,
        )
        console.log(`[dunning-retry] tenant ${id}: suspended → blocked`)
      } catch (err) {
        console.warn(`[dunning-retry] failed suspended→blocked for ${id}: ${String(err)}`)
      }
    }

    for (const id of blockedIds) {
      try {
        await transitionBlockedToChurned(id, tx)
        const deletionDate = new Date(Date.now() + 7 * 86_400_000)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'tenant_deletion_warning',
            triggerEvent: 'sweep.blocked_to_churned',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
              deletionDate: `${String(deletionDate.getUTCDate()).padStart(2, '0')}/${String(deletionDate.getUTCMonth() + 1).padStart(2, '0')}/${deletionDate.getUTCFullYear()}`,
              daysRemaining: 7,
            },
          },
          tx,
        )
        console.log(`[dunning-retry] tenant ${id}: blocked → churned`)
      } catch (err) {
        console.warn(`[dunning-retry] failed blocked→churned for ${id}: ${String(err)}`)
      }
    }

    for (const id of canceledIds) {
      try {
        await transitionCanceledToBlocked(id, tx)
        const deletionDate = new Date(Date.now() + 67 * 86_400_000)
        await enqueueTenantOwnerNotification(
          {
            tenantId: id,
            templateName: 'tenant_deletion_warning',
            triggerEvent: 'sweep.canceled_to_blocked',
            content: {
              ownerName: ownerName(ownerMap, id),
              tenantName: tenantName(ownerMap, id),
              deletionDate: `${String(deletionDate.getUTCDate()).padStart(2, '0')}/${String(deletionDate.getUTCMonth() + 1).padStart(2, '0')}/${deletionDate.getUTCFullYear()}`,
              daysRemaining: 67,
            },
          },
          tx,
        )
        console.log(`[dunning-retry] tenant ${id}: canceled → blocked (period ended)`)
      } catch (err) {
        console.warn(`[dunning-retry] failed canceled→blocked for ${id}: ${String(err)}`)
      }
    }

    for (const item of pendingItems) {
      try {
        await tx.execute(drizzleSql`
          UPDATE tenant_subscriptions
          SET plan_id = ${item.pendingPlanChange},
              pending_plan_change = NULL,
              pending_change_at = NULL,
              updated_at = NOW()
          WHERE tenant_id = ${item.tenant_id} AND status = 'active'
        `)
        await insertSystemAuditLog(tx, {
          tenantId: item.tenant_id,
          action: 'subscription.downgrade_applied',
          resourceType: 'tenant_subscription',
          resourceId: item.tenant_id,
          metadata: { newPlanId: item.pendingPlanChange },
        })
        console.log(`[dunning-retry] tenant ${item.tenant_id}: downgrade applied`)
      } catch (err) {
        console.warn(`[dunning-retry] failed downgrade for ${item.tenant_id}: ${String(err)}`)
      }
    }
  })
}

export async function registerDunningRetryWorker(boss: PgBoss): Promise<void> {
  // 13:00 ART = 16:00 UTC.
  await boss.schedule(QUEUE_DUNNING_RETRY, '0 16 * * *', {})
  await boss.work(QUEUE_DUNNING_RETRY, async () => {
    await runDunningSweep()
  })
  console.log(`[workers] registered ${QUEUE_DUNNING_RETRY}`)
}
