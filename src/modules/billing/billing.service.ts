import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import {
  DowngradeBlockedError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from './billing.errors'
import { transitionToCanceled } from './lifecycle.service'
import type {
  BillingCycle,
  CancelResult,
  DowngradeResult,
  SubscribeResult,
  SubscriptionState,
  SubscriptionStatus,
  UpgradeResult,
} from './billing.types'

/**
 * Orchestration layer between API endpoints and the gateway / lifecycle FSM.
 *
 * Each function is invoked inside `withTenantContext` (the tenant tx is opened
 * by the route wrapper). MP gateway calls happen INSIDE the tx; failures roll
 * back DB state along with the (idempotent) MP-side operations. MP itself is
 * idempotent for repeated `Preapproval.create` only at the HTTP retry layer —
 * we don't retry within a single business call.
 */

const PRORATION_PREFERENCE_TTL_HOURS = 24

type PlanRow = {
  id: string
  slug: string
  name: string
  max_courts: number | null
  price_monthly: number
  price_annual: number
}

type SubRow = {
  status: SubscriptionStatus
  plan_id: string
  billing_cycle: BillingCycle
  current_period_start: Date | string
  current_period_end: Date | string
  mp_subscription_id: string | null
  pending_plan_change: string | null
  pending_change_at: Date | string | null
  canceled_at: Date | string | null
  cancellation_reason: string | null
  scheduled_deletion_at: Date | string | null
  dunning_started_at: Date | string | null
  last_payment_failed_at: Date | string | null
  last_payment_at: Date | string | null
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

async function loadPlan(planId: string, tx: DbTx): Promise<PlanRow | null> {
  const rows = await tx.execute(sql`
    SELECT id, slug, name, max_courts, price_monthly, price_annual
    FROM plans
    WHERE id = ${planId} AND is_active = true
    LIMIT 1
  `)
  return (rows as unknown as Array<PlanRow>)[0] ?? null
}

async function loadSub(tenantId: string, tx: DbTx): Promise<SubRow | null> {
  const rows = await tx.execute(sql`
    SELECT status, plan_id, billing_cycle,
           current_period_start, current_period_end,
           mp_subscription_id, pending_plan_change, pending_change_at,
           canceled_at, cancellation_reason, scheduled_deletion_at,
           dunning_started_at, last_payment_failed_at, last_payment_at
    FROM tenant_subscriptions
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `)
  return (rows as unknown as Array<SubRow>)[0] ?? null
}

async function loadTenantOwner(
  tenantId: string,
  tx: DbTx,
): Promise<{ tenantName: string; ownerName: string | null; ownerEmail: string | null } | null> {
  const rows = await tx.execute(sql`
    SELECT t.name AS "tenantName",
           (
             SELECT su.first_name FROM tenant_staff_members tsm
             JOIN staff_users su ON su.id = tsm.staff_user_id
             WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
           ) AS "ownerName",
           (
             SELECT su.email FROM tenant_staff_members tsm
             JOIN staff_users su ON su.id = tsm.staff_user_id
             WHERE tsm.tenant_id = t.id AND tsm.is_active = true LIMIT 1
           ) AS "ownerEmail"
    FROM tenants t
    WHERE t.id = ${tenantId}
    LIMIT 1
  `)
  return (rows as unknown as Array<{
    tenantName: string
    ownerName: string | null
    ownerEmail: string | null
  }>)[0] ?? null
}

function planAmount(plan: PlanRow, cycle: BillingCycle): number {
  return cycle === 'annual' ? plan.price_annual : plan.price_monthly
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

function computeReturnUrl(): string {
  return `${process.env.APP_URL ?? 'http://localhost:3000'}/settings/facturacion`
}

function computeNotificationUrl(tenantId: string): string {
  return `${process.env.APP_URL ?? 'http://localhost:3000'}/api/webhooks/mercadopago?tenant=${tenantId}`
}

// ─── subscribe ──────────────────────────────────────────────────────────────

export async function subscribe(
  tenantId: string,
  planId: string,
  billingCycle: BillingCycle,
  gateway: PaymentGateway,
  tx: DbTx,
): Promise<SubscribeResult> {
  const sub = await loadSub(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)
  if (sub.status !== 'trialing') {
    throw new ReactivateNotAllowedError(tenantId, sub.status)
  }

  const plan = await loadPlan(planId, tx)
  if (!plan) throw new PlanNotFoundError(planId)

  const owner = await loadTenantOwner(tenantId, tx)
  if (!owner?.ownerEmail) {
    throw new SubscriptionNotFoundError(tenantId)
  }

  const amount = planAmount(plan, billingCycle)

  const preapproval = await gateway.createPreapproval({
    tenantId,
    payerEmail: owner.ownerEmail,
    amount,
    frequency: billingCycle,
    planId,
    reason: `TurnoGol — ${plan.name} (${billingCycle === 'annual' ? 'anual' : 'mensual'})`,
    returnUrl: computeReturnUrl(),
    notificationUrl: computeNotificationUrl(tenantId),
  })

  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET plan_id = ${planId},
        billing_cycle = ${billingCycle}::billing_cycle,
        mp_subscription_id = ${preapproval.preapprovalId},
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
  `)

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'subscription.subscribe_initiated',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: {
      planId,
      billingCycle,
      mpSubscriptionId: preapproval.preapprovalId,
    },
  })

  return {
    checkoutUrl: preapproval.initPoint,
    preapprovalId: preapproval.preapprovalId,
  }
}

// ─── upgrade ────────────────────────────────────────────────────────────────

export async function upgrade(
  tenantId: string,
  targetPlanId: string,
  gateway: PaymentGateway,
  tx: DbTx,
  now: Date = new Date(),
): Promise<UpgradeResult> {
  const sub = await loadSub(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)
  if (sub.status !== 'active') {
    throw new ReactivateNotAllowedError(tenantId, sub.status)
  }

  const targetPlan = await loadPlan(targetPlanId, tx)
  if (!targetPlan) throw new PlanNotFoundError(targetPlanId)

  const currentPlan = await loadPlan(sub.plan_id, tx)
  if (!currentPlan) throw new PlanNotFoundError(sub.plan_id)

  const newAmount = planAmount(targetPlan, sub.billing_cycle)
  const oldAmount = planAmount(currentPlan, sub.billing_cycle)

  const periodEnd = toDate(sub.current_period_end)
  const periodStart = toDate(sub.current_period_start)
  const periodMs = periodEnd.getTime() - periodStart.getTime()
  const remainingMs = periodEnd.getTime() - now.getTime()
  const daysInPeriod = Math.max(1, Math.round(periodMs / 86_400_000))
  const daysRemaining = Math.max(0, Math.round(remainingMs / 86_400_000))
  const prorationAmount = Math.max(
    0,
    Math.round(((newAmount - oldAmount) / daysInPeriod) * daysRemaining),
  )

  const expiresAt = new Date(now.getTime() + PRORATION_PREFERENCE_TTL_HOURS * 3_600_000)
  const preference = await gateway.createSaasUpgradePreference({
    tenantId,
    targetPlanId,
    amount: prorationAmount,
    description: `Upgrade a ${targetPlan.name}`,
    returnUrl: computeReturnUrl(),
    notificationUrl: computeNotificationUrl(tenantId),
    expiresAt,
  })

  // Mark pending upgrade. `pending_change_at = NULL` differentiates from
  // downgrade (which sets it to current_period_end).
  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET pending_plan_change = ${targetPlanId},
        pending_change_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'active'
  `)

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'subscription.upgrade_initiated',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: {
      fromPlanId: sub.plan_id,
      toPlanId: targetPlanId,
      prorationAmount,
      daysRemaining,
      daysInPeriod,
      preferenceId: preference.preferenceId,
    },
  })

  return {
    checkoutUrl: preference.initPoint,
    prorationAmount,
    preferenceId: preference.preferenceId,
  }
}

/**
 * Webhook callback when an upgrade-proration MP payment lands as approved.
 * Idempotency: the dispatcher locks via `processed_webhooks(mp_event_id)`.
 */
export async function handleUpgradeApproved(
  tenantId: string,
  targetPlanId: string,
  gateway: PaymentGateway,
  tx: DbTx,
): Promise<void> {
  const sub = await loadSub(tenantId, tx)
  if (!sub) return // tenant gone — nothing to do
  if (sub.status !== 'active') return
  if (sub.pending_plan_change !== targetPlanId) return // race / stale event

  const targetPlan = await loadPlan(targetPlanId, tx)
  if (!targetPlan) return

  const newAmount = planAmount(targetPlan, sub.billing_cycle)

  if (sub.mp_subscription_id) {
    await gateway.updatePreapprovalAmount(sub.mp_subscription_id, newAmount)
  }

  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET plan_id = ${targetPlanId},
        pending_plan_change = NULL,
        pending_change_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'active'
  `)

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'subscription.upgrade_completed',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: { fromPlanId: sub.plan_id, toPlanId: targetPlanId },
  })
}

// ─── downgrade (deferred to period end) ─────────────────────────────────────

export async function downgrade(
  tenantId: string,
  targetPlanId: string,
  tx: DbTx,
): Promise<DowngradeResult> {
  const sub = await loadSub(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)
  if (sub.status !== 'active') {
    throw new ReactivateNotAllowedError(tenantId, sub.status)
  }

  const targetPlan = await loadPlan(targetPlanId, tx)
  if (!targetPlan) throw new PlanNotFoundError(targetPlanId)

  if (targetPlan.max_courts !== null) {
    const courtRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM courts
      WHERE tenant_id = ${tenantId} AND status = 'online'
    `)
    const courtCount = (courtRows as unknown as Array<{ n: number }>)[0]!.n
    if (courtCount > targetPlan.max_courts) {
      throw new DowngradeBlockedError(tenantId, courtCount, targetPlan.max_courts)
    }
  }

  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET pending_plan_change = ${targetPlanId},
        pending_change_at = current_period_end,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'active'
  `)

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'subscription.downgrade_scheduled',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: {
      fromPlanId: sub.plan_id,
      toPlanId: targetPlanId,
      appliesAt: toDate(sub.current_period_end).toISOString(),
    },
  })

  return {
    appliesAt: toDate(sub.current_period_end),
    targetPlanId,
  }
}

// ─── cancel (voluntary) ─────────────────────────────────────────────────────

export async function cancel(
  tenantId: string,
  reason: string,
  gateway: PaymentGateway,
  tx: DbTx,
): Promise<CancelResult> {
  const sub = await loadSub(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)

  if (sub.mp_subscription_id) {
    await gateway.cancelPreapproval(sub.mp_subscription_id)
  }
  await transitionToCanceled(tenantId, reason, tx)

  const owner = await loadTenantOwner(tenantId, tx)
  if (owner) {
    await enqueueTenantOwnerNotification(
      {
        tenantId,
        templateName: 'subscription_canceled',
        triggerEvent: 'subscription.cancel',
        content: {
          ownerName: owner.ownerName ?? 'Hola',
          tenantName: owner.tenantName,
          accessUntil: formatDate(toDate(sub.current_period_end)),
        },
      },
      tx,
    )
  }

  return { accessUntil: toDate(sub.current_period_end) }
}

// ─── reactivate (canceled or churned, before deletion_at) ───────────────────

export async function reactivate(
  tenantId: string,
  planId: string,
  billingCycle: BillingCycle,
  gateway: PaymentGateway,
  tx: DbTx,
  now: Date = new Date(),
): Promise<SubscribeResult> {
  const sub = await loadSub(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)

  const allowed: SubscriptionStatus[] = ['canceled', 'churned']
  if (!allowed.includes(sub.status)) {
    throw new ReactivateNotAllowedError(tenantId, sub.status)
  }
  if (sub.scheduled_deletion_at && toDate(sub.scheduled_deletion_at) <= now) {
    throw new ReactivateNotAllowedError(tenantId, `${sub.status}_past_deletion`)
  }

  const plan = await loadPlan(planId, tx)
  if (!plan) throw new PlanNotFoundError(planId)

  const owner = await loadTenantOwner(tenantId, tx)
  if (!owner?.ownerEmail) throw new SubscriptionNotFoundError(tenantId)

  const amount = planAmount(plan, billingCycle)

  const preapproval = await gateway.createPreapproval({
    tenantId,
    payerEmail: owner.ownerEmail,
    amount,
    frequency: billingCycle,
    planId,
    reason: `TurnoGol — ${plan.name} (reactivación)`,
    returnUrl: computeReturnUrl(),
    notificationUrl: computeNotificationUrl(tenantId),
  })

  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET plan_id = ${planId},
        billing_cycle = ${billingCycle}::billing_cycle,
        mp_subscription_id = ${preapproval.preapprovalId},
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
  `)

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'subscription.reactivate_initiated',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: {
      planId,
      billingCycle,
      fromStatus: sub.status,
      mpSubscriptionId: preapproval.preapprovalId,
    },
  })

  return {
    checkoutUrl: preapproval.initPoint,
    preapprovalId: preapproval.preapprovalId,
  }
}

// ─── read: subscription state ───────────────────────────────────────────────

export async function getSubscriptionState(
  tenantId: string,
  tx: DbTx,
): Promise<SubscriptionState> {
  const rows = await tx.execute(sql`
    SELECT ts.tenant_id AS "tenantId",
           ts.status,
           ts.plan_id AS "planId",
           p.slug AS "planSlug",
           p.name AS "planName",
           ts.billing_cycle AS "billingCycle",
           ts.current_period_start AS "currentPeriodStart",
           ts.current_period_end AS "currentPeriodEnd",
           ts.mp_subscription_id AS "mpSubscriptionId",
           ts.pending_plan_change AS "pendingPlanChange",
           ts.pending_change_at AS "pendingChangeAt",
           ts.canceled_at AS "canceledAt",
           ts.cancellation_reason AS "cancellationReason",
           ts.scheduled_deletion_at AS "scheduledDeletionAt",
           ts.dunning_started_at AS "dunningStartedAt",
           ts.last_payment_failed_at AS "lastPaymentFailedAt",
           ts.last_payment_at AS "lastPaymentAt"
    FROM tenant_subscriptions ts
    JOIN plans p ON p.id = ts.plan_id
    WHERE ts.tenant_id = ${tenantId}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<SubscriptionState>)[0]
  if (!row) throw new SubscriptionNotFoundError(tenantId)
  return row
}
