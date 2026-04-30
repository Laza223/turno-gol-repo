import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import {
  transitionActiveToPastDue,
  transitionPastDueToActive,
  transitionToActiveFromAny,
  transitionTrialingToActive,
} from './lifecycle.service'
import type { BillingCycle, SubscriptionStatus } from './billing.types'

/**
 * Webhook-driven dunning. Handles MP `subscription_authorized_payment` events
 * (the recurring charge result, child of a preapproval).
 *
 * Idempotency: each function INSERTs `processed_webhooks` ON CONFLICT DO NOTHING.
 * If the same `mpEventId` is replayed, the call is a no-op (returns true).
 *
 * Source-state branching: the same webhook may arrive while the sub is in any
 * of {trialing, active, past_due, suspended, blocked, churned}. The function
 * picks the appropriate lifecycle transition (or no-op for spurious events).
 */

type SubRow = {
  status: SubscriptionStatus
  billing_cycle: BillingCycle
  current_period_end: Date | string
  mp_subscription_id: string | null
  plan_name: string
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

type TenantOwnerInfo = {
  tenantName: string
  ownerName: string | null
}

async function lockWebhook(
  mpEventId: string,
  eventType: string,
  rawPayload: unknown,
  tx: DbTx,
): Promise<boolean> {
  const lock = await tx.execute(sql`
    INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
    VALUES (${mpEventId}, ${eventType}, ${JSON.stringify(rawPayload)}::jsonb)
    ON CONFLICT (mp_event_id) DO NOTHING
    RETURNING id
  `)
  return (lock as unknown as Array<{ id: string }>).length > 0
}

async function loadSub(tenantId: string, tx: DbTx): Promise<SubRow | null> {
  const rows = await tx.execute(sql`
    SELECT ts.status, ts.billing_cycle, ts.current_period_end,
           ts.mp_subscription_id, p.name AS plan_name
    FROM tenant_subscriptions ts
    JOIN plans p ON p.id = ts.plan_id
    WHERE ts.tenant_id = ${tenantId}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<SubRow>)[0]
  return row ?? null
}

async function loadTenantInfo(
  tenantId: string,
  tx: DbTx,
): Promise<TenantOwnerInfo | null> {
  const rows = await tx.execute(sql`
    SELECT t.name AS "tenantName",
           (
             SELECT su.first_name
             FROM tenant_staff_members tsm
             JOIN staff_users su ON su.id = tsm.staff_user_id
             WHERE tsm.tenant_id = t.id AND tsm.is_active = true
             LIMIT 1
           ) AS "ownerName"
    FROM tenants t
    WHERE t.id = ${tenantId}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<TenantOwnerInfo>)[0]
  return row ?? null
}

function extendPeriod(currentEnd: Date, cycle: BillingCycle): Date {
  const d = new Date(currentEnd)
  if (cycle === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1)
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + 1)
  }
  return d
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

/**
 * Recurring charge rejected. Drives `active → past_due`. Subsequent rejections
 * while in dunning are no-ops on state but bump `last_payment_failed_at`.
 */
export async function onPaymentRejected(
  tenantId: string,
  mpEventId: string,
  eventType: string,
  rawPayload: unknown,
  failedAt: Date,
  tx: DbTx,
): Promise<{ alreadyProcessed: boolean }> {
  const fresh = await lockWebhook(mpEventId, eventType, rawPayload, tx)
  if (!fresh) return { alreadyProcessed: true }

  const sub = await loadSub(tenantId, tx)
  if (!sub) return { alreadyProcessed: false }

  if (sub.status === 'active') {
    await transitionActiveToPastDue(tenantId, failedAt, tx)
  } else if (sub.status === 'past_due' || sub.status === 'suspended' || sub.status === 'blocked') {
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET last_payment_failed_at = ${failedAt.toISOString()}::timestamptz,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `)
  } else {
    // trialing/canceled/churned — spurious recurring rejection. Record but
    // don't change state.
    return { alreadyProcessed: false }
  }

  const tenantInfo = await loadTenantInfo(tenantId, tx)
  if (tenantInfo) {
    const retryDate = formatDate(new Date(failedAt.getTime() + 3 * 86_400_000))
    await enqueueTenantOwnerNotification(
      {
        tenantId,
        templateName: 'dunning_payment_failed',
        triggerEvent: 'subscription_payment_rejected',
        content: {
          ownerName: tenantInfo.ownerName ?? 'Hola',
          tenantName: tenantInfo.tenantName,
          retryDate,
        },
      },
      tx,
    )
  }

  return { alreadyProcessed: false }
}

/**
 * Recurring charge approved. Drives state forward:
 *   - trialing  → active (first authorized_payment after subscribe)
 *   - past_due  → active (recovery)
 *   - suspended/blocked/churned → active (late recovery)
 *   - active    → no transition; just extend period + bump last_payment_at
 *   - canceled  → no-op (preapproval should be canceled in MP already)
 */
export async function onPaymentApproved(
  tenantId: string,
  mpEventId: string,
  eventType: string,
  rawPayload: unknown,
  paidAt: Date,
  tx: DbTx,
): Promise<{ alreadyProcessed: boolean }> {
  const fresh = await lockWebhook(mpEventId, eventType, rawPayload, tx)
  if (!fresh) return { alreadyProcessed: true }

  const sub = await loadSub(tenantId, tx)
  if (!sub) return { alreadyProcessed: false }

  const newPeriodEnd = extendPeriod(toDate(sub.current_period_end), sub.billing_cycle)

  let template: 'subscription_activated' | 'subscription_renewed' | null = null

  if (sub.status === 'trialing') {
    await transitionTrialingToActive(tenantId, paidAt, newPeriodEnd, tx)
    template = 'subscription_activated'
  } else if (sub.status === 'past_due') {
    await transitionPastDueToActive(tenantId, paidAt, newPeriodEnd, tx)
    template = 'subscription_renewed'
  } else if (
    sub.status === 'suspended' ||
    sub.status === 'blocked' ||
    sub.status === 'churned'
  ) {
    await transitionToActiveFromAny(tenantId, paidAt, newPeriodEnd, tx)
    template = 'subscription_renewed'
  } else if (sub.status === 'active') {
    // No transition — just extend period.
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET current_period_end = ${newPeriodEnd.toISOString()}::timestamptz,
          last_payment_at = ${paidAt.toISOString()}::timestamptz,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND status = 'active'
    `)
    template = 'subscription_renewed'
  } else {
    // canceled — preapproval should be canceled in MP, ignore.
    return { alreadyProcessed: false }
  }

  const tenantInfo = await loadTenantInfo(tenantId, tx)
  if (tenantInfo && template) {
    await enqueueTenantOwnerNotification(
      {
        tenantId,
        templateName: template,
        triggerEvent: 'subscription_payment_approved',
        content: {
          ownerName: tenantInfo.ownerName ?? 'Hola',
          tenantName: tenantInfo.tenantName,
          planName: sub.plan_name,
          periodEnd: formatDate(newPeriodEnd),
        },
      },
      tx,
    )
  }

  return { alreadyProcessed: false }
}
