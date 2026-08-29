import type PgBoss from 'pg-boss'
import { sql as drizzleSql } from 'drizzle-orm'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import {
  transitionBlockedToChurned,
  transitionCanceledToBlocked,
  transitionPastDueToSuspended,
  transitionSuspendedToBlocked,
} from '@/modules/billing/lifecycle.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { CRON_WORK_OPTIONS, QUEUE_DUNNING_RETRY } from '../definitions'
import { logger } from '@/shared/lib/logger'

/**
 * Daily 13:00 ART sweep. Drives time-based escalations of the SaaS lifecycle.
 *
 * MP itself handles charge retries (day 0/2/5 cadence per doc4 §4); this sweep
 * only escalates state machine past day 7. Each per-tenant transition writes
 * an audit_log entry + enqueues a `subscription_*` notification. Pending
 * downgrades scheduled at `current_period_end` are applied here.
 *
 * The cross-tenant reads below (which tenants need escalating) run on the
 * service-role pool — a single query can't be scoped to one
 * `app.current_tenant_id` (Fable 5 P0). Each per-tenant write then opens its
 * own short, correctly tenant-scoped transaction instead of sharing one giant
 * tx across every tenant in the sweep.
 */

type TenantOwnerInfo = {
  tenantId: string
  tenantName: string
  ownerName: string | null
}

async function loadTenantOwners(tenantIds: string[]): Promise<TenantOwnerInfo[]> {
  if (tenantIds.length === 0) return []
  const sql = getWorkerSql()
  // Una sola query para todos los complejos morosos del barrido. Antes había un
  // SELECT por id — la "mejora futura" que el comentario de esta función venía
  // anotando. Sigue sin `Promise.all` a propósito: `getWorkerSql()` es una
  // conexión postgres-js compartida y no corre queries en paralelo.
  const rows = await sql<TenantOwnerInfo[]>`
    SELECT t.id AS "tenantId",
           t.name AS "tenantName",
           (
             SELECT su.first_name FROM tenant_staff_members tsm
             JOIN staff_users su ON su.id = tsm.staff_user_id
             WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
           ) AS "ownerName"
    FROM tenants t
    WHERE t.id = ANY(${tenantIds}::uuid[])
  `
  return [...rows]
}

function ownerName(map: Map<string, TenantOwnerInfo>, tenantId: string): string {
  return map.get(tenantId)?.ownerName ?? 'Hola'
}

function tenantName(map: Map<string, TenantOwnerInfo>, tenantId: string): string {
  return map.get(tenantId)?.tenantName ?? '(complejo)'
}

export async function runDunningSweep(): Promise<void> {
  const sql = getWorkerSql()

  // ─── 1. past_due → suspended (≥ 7d) ────────────────────────────────────
  const pastDueRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'past_due'
      AND dunning_started_at IS NOT NULL
      AND dunning_started_at <= NOW() - INTERVAL '7 days'
  `
  const pastDueIds = pastDueRows.map((r) => r.tenant_id)

  // ─── 2. suspended → blocked (≥ 14d) ────────────────────────────────────
  const suspendedRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'suspended'
      AND dunning_started_at IS NOT NULL
      AND dunning_started_at <= NOW() - INTERVAL '14 days'
  `
  const suspendedIds = suspendedRows.map((r) => r.tenant_id)

  // ─── 3. blocked → churned (≥ 90d) ──────────────────────────────────────
  const blockedRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'blocked'
      AND dunning_started_at IS NOT NULL
      AND dunning_started_at <= NOW() - INTERVAL '90 days'
  `
  const blockedIds = blockedRows.map((r) => r.tenant_id)

  // ─── 4. canceled & period_end < NOW → blocked ──────────────────────────
  const canceledRows = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_subscriptions
    WHERE status = 'canceled' AND current_period_end < NOW()
  `
  const canceledIds = canceledRows.map((r) => r.tenant_id)

  // ─── 5. pending_plan_change applies (downgrade) ────────────────────────
  const pendingItems = await sql<{ tenant_id: string; pendingPlanChange: string }[]>`
    SELECT tenant_id, pending_plan_change AS "pendingPlanChange"
    FROM tenant_subscriptions
    WHERE pending_plan_change IS NOT NULL
      AND pending_change_at IS NOT NULL
      AND pending_change_at <= NOW()
      AND status = 'active'
  `

  const dedupSet = new Set<string>()
  pastDueIds.forEach((id) => dedupSet.add(id))
  suspendedIds.forEach((id) => dedupSet.add(id))
  blockedIds.forEach((id) => dedupSet.add(id))
  canceledIds.forEach((id) => dedupSet.add(id))
  pendingItems.forEach((p) => dedupSet.add(p.tenant_id))
  const allIds: string[] = []
  dedupSet.forEach((id) => allIds.push(id))
  const owners = await loadTenantOwners(allIds)
  const ownerMap = new Map(owners.map((o) => [o.tenantId, o]))

  for (const id of pastDueIds) {
    try {
      await withTenantContext(id, async (tx) => {
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
      })
      logger.info('tenant transitioned past_due → suspended', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed past_due→suspended', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const id of suspendedIds) {
    try {
      await withTenantContext(id, async (tx) => {
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
      })
      logger.info('tenant transitioned suspended → blocked', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed suspended→blocked', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const id of blockedIds) {
    try {
      const deletionDate = new Date(Date.now() + 7 * 86_400_000)
      await withTenantContext(id, async (tx) => {
        await transitionBlockedToChurned(id, tx)
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
      })
      logger.info('tenant transitioned blocked → churned', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed blocked→churned', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const id of canceledIds) {
    try {
      const deletionDate = new Date(Date.now() + 67 * 86_400_000)
      await withTenantContext(id, async (tx) => {
        await transitionCanceledToBlocked(id, tx)
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
      })
      logger.info('tenant transitioned canceled → blocked (period ended)', {
        module: 'dunning-retry',
        tenantId: id,
      })
    } catch (err) {
      logger.warn('failed canceled→blocked', {
        module: 'dunning-retry',
        tenantId: id,
        error: String(err),
      })
    }
  }

  for (const item of pendingItems) {
    try {
      await withTenantContext(item.tenant_id, async (tx) => {
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
      })
      logger.info('tenant downgrade applied', { module: 'dunning-retry', tenantId: item.tenant_id })
    } catch (err) {
      logger.warn('failed downgrade', {
        module: 'dunning-retry',
        tenantId: item.tenant_id,
        error: String(err),
      })
    }
  }
}

export async function registerDunningRetryWorker(boss: PgBoss): Promise<void> {
  // 13:00 ART = 16:00 UTC.
  await boss.schedule(QUEUE_DUNNING_RETRY, '0 16 * * *', {})
  await boss.work(QUEUE_DUNNING_RETRY, CRON_WORK_OPTIONS, async () => {
    await runDunningSweep()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_DUNNING_RETRY })
}
