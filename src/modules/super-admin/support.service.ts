import { sql } from 'drizzle-orm'
import { getDb, withTenantContext, type DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import {
  transitionActiveToPastDue,
  transitionBlockedToChurned,
  transitionCanceledToBlocked,
  transitionPastDueToSuspended,
  transitionSuspendedToBlocked,
  transitionToActiveFromAny,
  transitionToDeleted,
  transitionTrialingToActive,
} from '@/modules/billing/lifecycle.service'
import { cancel as billingCancel } from '@/modules/billing/billing.service'
import {
  DowngradeBlockedError,
  InvalidTransitionError,
  PlanNotFoundError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import { updateTenantSettings } from '@/modules/tenants/tenant.service'
import type { TenantSettings, UpdateTenantSettingsInput } from '@/modules/tenants/tenant.types'
import type { BillingCycle, TenantStatus } from '@/modules/billing/billing.types'

/**
 * Acciones de soporte del SuperAdmin (spec §5).
 *
 * Wrappers finos: cada función reusa los servicios existentes (lifecycle FSM,
 * billing, tenant.service) y agrega SOLO la lógica de soporte + el audit log
 * `support.*` (spec §8) con `actor_id` = uuid del system admin (NO el
 * sentinel) y `actor_type = 'system'`. La autorización (guard + rate limit)
 * vive en las Server Actions, no acá.
 */

// ─── Errores propios ─────────────────────────────────────────────────────────

export class TenantNotFoundError extends Error {
  readonly code = 'TENANT_NOT_FOUND'
  constructor(public readonly tenantId: string) {
    super(`Tenant ${tenantId} not found`)
    this.name = 'TenantNotFoundError'
  }
}

export class TrialNotActiveError extends Error {
  readonly code = 'TRIAL_NOT_ACTIVE'
  constructor(
    public readonly tenantId: string,
    public readonly status: string,
  ) {
    super(`Tenant ${tenantId} is '${status}', not trialing — cannot extend trial`)
    this.name = 'TrialNotActiveError'
  }
}

export class PlanAlreadyAssignedError extends Error {
  readonly code = 'PLAN_ALREADY_ASSIGNED'
  constructor(public readonly tenantId: string) {
    super(`Tenant ${tenantId} already has that plan`)
    this.name = 'PlanAlreadyAssignedError'
  }
}

// ─── FSM: transiciones forzables ─────────────────────────────────────────────

/**
 * Destinos válidos por estado actual, DERIVADOS de las funciones reales de
 * `lifecycle.service.ts` (no reimplementa el FSM — cada par mapea 1:1 a una
 * transición existente, que sigue siendo la que valida en el WHERE):
 *
 *   trialing → active     transitionTrialingToActive
 *   active   → past_due   transitionActiveToPastDue
 *   past_due → active     transitionToActiveFromAny
 *   past_due → suspended  transitionPastDueToSuspended (gate: dunning ≥ 7d)
 *   suspended→ active     transitionToActiveFromAny
 *   suspended→ blocked    transitionSuspendedToBlocked (gate: dunning ≥ 14d)
 *   blocked  → active     transitionToActiveFromAny
 *   blocked  → churned    transitionBlockedToChurned (gate: dunning ≥ 90d)
 *   blocked  → deleted    transitionToDeleted (gate: scheduled_deletion_at vencido)
 *   canceled → active     transitionToActiveFromAny
 *   canceled → blocked    transitionCanceledToBlocked (gate: period_end vencido)
 *   canceled → deleted    transitionToDeleted (gate: scheduled_deletion_at vencido)
 *   churned  → active     transitionToActiveFromAny
 *   churned  → deleted    transitionToDeleted (gate: scheduled_deletion_at vencido)
 *
 * `canceled` como DESTINO se maneja con `cancelSubscriptionForSupport` (además
 * cancela el preapproval MP), no desde acá. Los gates temporales del FSM se
 * respetan: si no se cumplen, la transición tira InvalidTransitionError.
 */
export const FORCEABLE_TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  trialing: ['active'],
  active: ['past_due'],
  past_due: ['active', 'suspended'],
  suspended: ['active', 'blocked'],
  blocked: ['active', 'churned', 'deleted'],
  canceled: ['active', 'blocked', 'deleted'],
  churned: ['active', 'deleted'],
  deleted: [],
}

/** Estados desde los que `reactivateTenant` (transitionToActiveFromAny) aplica. */
export const REACTIVATABLE_STATUSES: readonly TenantStatus[] = [
  'canceled',
  'churned',
  'blocked',
  'past_due',
  'suspended',
]

// ─── Helpers internos ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS)
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

type TenantRowLite = {
  status: TenantStatus
  name: string
  trial_ends_at: Date | string | null
}

async function loadTenantForUpdate(tx: DbTx, tenantId: string): Promise<TenantRowLite> {
  const rows = await tx.execute(sql`
    SELECT status, name, trial_ends_at
    FROM tenants
    WHERE id = ${tenantId}
    FOR UPDATE
  `)
  const row = (rows as unknown as TenantRowLite[])[0]
  if (!row) throw new TenantNotFoundError(tenantId)
  return row
}

type SubRowLite = {
  status: string
  plan_id: string
  billing_cycle: BillingCycle
  mp_subscription_id: string | null
}

async function loadSubForUpdate(tx: DbTx, tenantId: string): Promise<SubRowLite | null> {
  const rows = await tx.execute(sql`
    SELECT status, plan_id, billing_cycle, mp_subscription_id
    FROM tenant_subscriptions
    WHERE tenant_id = ${tenantId}
    FOR UPDATE
  `)
  return (rows as unknown as SubRowLite[])[0] ?? null
}

function supportAudit(
  tx: DbTx,
  systemAdminId: string,
  tenantId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  return insertAuditLog(tx, {
    tenantId,
    actorId: systemAdminId,
    actorType: 'system',
    action,
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata,
  })
}

/** Ventana de período para forzar 'active' sin pago: ahora → +30d/+365d. */
function forcedPeriodWindow(cycle: BillingCycle, now: Date): { start: Date; end: Date } {
  return { start: now, end: addDays(now, cycle === 'annual' ? 365 : 30) }
}

// ─── Extender trial (único servicio nuevo de F1, spec §5) ────────────────────

/**
 * Mueve `tenants.trial_ends_at` a max(now, fin actual) + days. Solo aplica a
 * tenants `trialing` (el sweep expire-trials usa trial_ends_at como ancla).
 * Update + audit corren en la MISMA transacción (atómico): `tenants` es tabla
 * global (sin RLS) así que el UPDATE funciona igual dentro del contexto de
 * tenant, y `audit_logs` (RLS) necesita ese contexto para el INSERT.
 */
export async function extendTrial(
  tenantId: string,
  days: number,
  systemAdminId: string,
  now: Date = new Date(),
): Promise<{ trialEndsAt: Date }> {
  return withTenantContext(tenantId, async (tx) => {
    const tenant = await loadTenantForUpdate(tx, tenantId)
    if (tenant.status !== 'trialing') {
      throw new TrialNotActiveError(tenantId, tenant.status)
    }

    const currentEnd = tenant.trial_ends_at ? toDate(tenant.trial_ends_at) : now
    const base = currentEnd > now ? currentEnd : now
    const newEnd = addDays(base, days)

    await tx.execute(sql`
      UPDATE tenants
      SET trial_ends_at = ${newEnd.toISOString()}::timestamptz, updated_at = NOW()
      WHERE id = ${tenantId}
    `)

    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.trial_extended', {
      days,
      before: { trialEndsAt: tenant.trial_ends_at ? toDate(tenant.trial_ends_at).toISOString() : null },
      after: { trialEndsAt: newEnd.toISOString() },
    })

    return { trialEndsAt: newEnd }
  })
}

// ─── Forzar transición de estado (reusa el FSM de lifecycle.service) ─────────

export async function forceTenantStatus(
  tenantId: string,
  targetStatus: TenantStatus,
  systemAdminId: string,
  now: Date = new Date(),
): Promise<{ from: TenantStatus; to: TenantStatus }> {
  return withTenantContext(tenantId, async (tx) => {
    const tenant = await loadTenantForUpdate(tx, tenantId)
    const from = tenant.status

    if (!FORCEABLE_TRANSITIONS[from].includes(targetStatus)) {
      throw new InvalidTransitionError(tenantId, from, targetStatus)
    }

    switch (targetStatus) {
      case 'active': {
        const sub = await loadSubForUpdate(tx, tenantId)
        if (!sub) throw new SubscriptionNotFoundError(tenantId)
        const { start, end } = forcedPeriodWindow(sub.billing_cycle, now)
        if (from === 'trialing') {
          await transitionTrialingToActive(tenantId, start, end, tx)
        } else {
          await transitionToActiveFromAny(tenantId, start, end, tx)
        }
        break
      }
      case 'past_due':
        await transitionActiveToPastDue(tenantId, now, tx)
        break
      case 'suspended':
        await transitionPastDueToSuspended(tenantId, tx)
        break
      case 'blocked':
        if (from === 'canceled') {
          await transitionCanceledToBlocked(tenantId, tx)
        } else {
          await transitionSuspendedToBlocked(tenantId, tx)
        }
        break
      case 'churned':
        await transitionBlockedToChurned(tenantId, tx)
        break
      case 'deleted':
        await transitionToDeleted(tenantId, tx)
        break
      default:
        throw new InvalidTransitionError(tenantId, from, targetStatus)
    }

    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.status_forced', {
      before: { status: from },
      after: { status: targetStatus },
    })

    return { from, to: targetStatus }
  })
}

// ─── Reactivar (transitionToActiveFromAny, spec §5) ──────────────────────────

export async function reactivateTenant(
  tenantId: string,
  systemAdminId: string,
  now: Date = new Date(),
): Promise<{ from: TenantStatus }> {
  return withTenantContext(tenantId, async (tx) => {
    const tenant = await loadTenantForUpdate(tx, tenantId)
    const sub = await loadSubForUpdate(tx, tenantId)
    if (!sub) throw new SubscriptionNotFoundError(tenantId)

    const { start, end } = forcedPeriodWindow(sub.billing_cycle, now)
    await transitionToActiveFromAny(tenantId, start, end, tx)

    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.status_forced', {
      reason: 'reactivated_by_support',
      before: { status: tenant.status },
      after: { status: 'active' },
    })

    return { from: tenant.status }
  })
}

// ─── Cambiar plan sin cobro ──────────────────────────────────────────────────

/**
 * Cambio de plan inmediato SIN cobro MP. No reusa `billing.upgrade` /
 * `billing.downgrade` porque esos caminos siempre pasan por MP (preference de
 * proración / cambio diferido al fin del período) y agregar un flag de soporte
 * ahí tocaba flujos compartidos con el checkout real. Esto replica solo el
 * efecto final (mismo UPDATE que `handleUpgradeApproved`):
 *   - valida el límite de canchas del plan destino (mismo invariante que
 *     billing.downgrade),
 *   - swapea plan_id y limpia cualquier cambio pendiente,
 *   - si hay preapproval MP activo, actualiza el monto recurrente para que el
 *     próximo ciclo cobre el precio nuevo (sin cargo hoy).
 */
export async function changePlanForSupport(
  tenantId: string,
  targetPlanId: string,
  systemAdminId: string,
  gateway: PaymentGateway,
): Promise<{ fromPlanId: string; toPlanId: string }> {
  return withTenantContext(tenantId, async (tx) => {
    const sub = await loadSubForUpdate(tx, tenantId)
    if (!sub) throw new SubscriptionNotFoundError(tenantId)
    if (sub.plan_id === targetPlanId) throw new PlanAlreadyAssignedError(tenantId)

    const planRows = await tx.execute(sql`
      SELECT id, max_courts, price_monthly, price_annual
      FROM plans
      WHERE id = ${targetPlanId} AND is_active = true
      LIMIT 1
    `)
    const plan = (planRows as unknown as Array<{
      id: string
      max_courts: number | null
      price_monthly: number
      price_annual: number
    }>)[0]
    if (!plan) throw new PlanNotFoundError(targetPlanId)

    if (plan.max_courts !== null) {
      const courtRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM courts
        WHERE tenant_id = ${tenantId} AND status = 'online'
      `)
      const courtCount = (courtRows as unknown as Array<{ n: number }>)[0]!.n
      if (courtCount > plan.max_courts) {
        throw new DowngradeBlockedError(tenantId, courtCount, plan.max_courts)
      }
    }

    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET plan_id = ${targetPlanId},
          pending_plan_change = NULL,
          pending_change_at = NULL,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `)

    // Dentro de la tx (mismo patrón que billing.service): si MP falla, el
    // cambio de plan rollbackea junto con el audit.
    if (sub.mp_subscription_id) {
      const newAmount =
        sub.billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly
      await gateway.updatePreapprovalAmount(sub.mp_subscription_id, newAmount)
    }

    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.plan_changed', {
      before: { planId: sub.plan_id },
      after: { planId: targetPlanId },
      mpAmountUpdated: sub.mp_subscription_id !== null,
    })

    return { fromPlanId: sub.plan_id, toPlanId: targetPlanId }
  })
}

// ─── Cancelar suscripción (reusa billing.cancel) ─────────────────────────────

export async function cancelSubscriptionForSupport(
  tenantId: string,
  reason: string,
  systemAdminId: string,
  gateway: PaymentGateway,
): Promise<{ accessUntil: Date }> {
  return withTenantContext(tenantId, async (tx) => {
    const tenant = await loadTenantForUpdate(tx, tenantId)

    // billing.cancel cancela el preapproval MP, corre transitionToCanceled
    // (que valida el FSM) y encola la notificación al dueño.
    const result = await billingCancel(tenantId, reason, gateway, tx)

    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.status_forced', {
      reason,
      before: { status: tenant.status },
      after: { status: 'canceled' },
    })

    return result
  })
}

// ─── Editar settings whitelisteados (reusa updateTenantSettings) ─────────────

export async function updateTenantSettingsForSupport(
  tenantId: string,
  patch: UpdateTenantSettingsInput,
  systemAdminId: string,
): Promise<void> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT settings FROM tenants WHERE id = ${tenantId} LIMIT 1
  `)
  const existing = (rows as unknown as Array<{ settings: TenantSettings }>)[0]
  if (!existing) throw new TenantNotFoundError(tenantId)

  const keys = Object.keys(patch) as Array<keyof UpdateTenantSettingsInput>
  const before = Object.fromEntries(keys.map((k) => [k, existing.settings[k] ?? null]))
  const after = Object.fromEntries(keys.map((k) => [k, patch[k] ?? null]))

  // Reusa el servicio existente (lee-mergea-escribe con getDb). NO atómico con
  // el audit de abajo: updateTenantSettings no acepta tx; en el peor caso (crash
  // entre ambas) quedan settings aplicados sin fila de audit. Aceptado para F1.
  await updateTenantSettings(tenantId, patch)

  await withTenantContext(tenantId, async (tx) => {
    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.settings_updated', {
      before,
      after,
    })
  })
}
