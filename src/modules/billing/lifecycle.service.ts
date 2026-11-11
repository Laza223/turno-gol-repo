import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { InvalidTransitionError } from './billing.errors'

/**
 * Pure FSM transitions per doc4 §2. Each function:
 *   1. Runs an UPDATE on `tenant_subscriptions` scoped by `tenant_id` + source state.
 *   2. If 0 rows updated → `InvalidTransitionError` (caller observes).
 *   3. Mirror UPDATE on `tenants.status`.
 *   4. INSERT audit_log entry.
 *
 * Sweep workers may pre-filter by status+anchor and call these per-tenant; the
 * WHERE clauses still gate to keep the function safe under concurrent updates.
 *
 * Note on RLS: callers either run inside `withTenantContext` (RLS-on, scoped to
 * the tenant) or in a service-role transaction (sweep workers — RLS bypassed).
 * Either way, the tenant_id literal in the WHERE clause is the source of truth.
 */

const PAST_DUE_TO_SUSPENDED_DAYS = 7
const SUSPENDED_TO_FREE_DAYS = 14
const BLOCKED_TO_CHURNED_DAYS = 90

/**
 * Retención tras la baja, antes del borrado real. **Es un número legal, no una
 * preferencia de producto**: `/terminos` §"Los datos del complejo se conservan
 * 90 días tras la baja (estado churned)" y `/privacidad` §"Datos de tenants
 * churned: 90 días" ya se lo prometen al titular.
 *
 * Estuvo en 7 hasta 2026-08-09: el código borraba 83 días antes de lo que los
 * términos publicados garantizan. La migración 073 corrige además las filas que
 * `transitionBlockedToChurned` ya había fechado con el valor viejo — cambiar la
 * constante sola no alcanza, porque `scheduled_deletion_at` se materializa en
 * la fila en el momento de la transición.
 */
export const CHURNED_DELETION_DAYS = 90

type AffectedRow = { id: string }

function rowsAffected(result: unknown): number {
  return (result as unknown as Array<AffectedRow>).length
}

// ─── trialing → active (first paid recurring charge) ────────────────────────
// Caller (billing.subscribe) has already set plan_id, billing_cycle and
// mp_subscription_id at preapproval-creation time. This transition only flips
// status + sets the period window + clears dunning anchors.

export async function transitionTrialingToActive(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  tx: DbTx,
): Promise<void> {
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'active'::subscription_status,
        current_period_start = ${periodStart.toISOString()}::timestamptz,
        current_period_end = ${periodEnd.toISOString()}::timestamptz,
        last_payment_at = NOW(),
        dunning_started_at = NULL,
        last_payment_failed_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'trialing'
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, 'trialing', 'active')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'active'::tenant_status, updated_at = NOW()
    WHERE id = ${tenantId} AND status = 'trialing'
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.activated',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { periodEnd: periodEnd.toISOString() },
  })
}

// ─── active → past_due (first payment.rejected webhook) ─────────────────────

export async function transitionActiveToPastDue(
  tenantId: string,
  failedAt: Date,
  tx: DbTx,
): Promise<void> {
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'past_due'::subscription_status,
        dunning_started_at = ${failedAt.toISOString()}::timestamptz,
        last_payment_failed_at = ${failedAt.toISOString()}::timestamptz,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'active'
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, 'active', 'past_due')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'past_due'::tenant_status, updated_at = NOW()
    WHERE id = ${tenantId} AND status = 'active'
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.past_due',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { failedAt: failedAt.toISOString() },
  })
}

// ─── past_due → active (recovery, payment.approved during dunning) ──────────

export async function transitionPastDueToActive(
  tenantId: string,
  paidAt: Date,
  periodEnd: Date,
  tx: DbTx,
): Promise<void> {
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'active'::subscription_status,
        current_period_end = ${periodEnd.toISOString()}::timestamptz,
        last_payment_at = ${paidAt.toISOString()}::timestamptz,
        dunning_started_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'past_due'
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, 'past_due', 'active')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'active'::tenant_status, updated_at = NOW()
    WHERE id = ${tenantId} AND status = 'past_due'
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.recovered',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: {
      paidAt: paidAt.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  })
}

// ─── past_due → suspended (sweep, ≥ 7d in past_due) ─────────────────────────

export async function transitionPastDueToSuspended(tenantId: string, tx: DbTx): Promise<void> {
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'suspended'::subscription_status, updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND status = 'past_due'
      AND dunning_started_at <= NOW() - (${PAST_DUE_TO_SUSPENDED_DAYS} || ' days')::interval
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, 'past_due', 'suspended')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'suspended'::tenant_status, updated_at = NOW()
    WHERE id = ${tenantId} AND status = 'past_due'
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.suspended',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { reason: 'dunning_day_7' },
  })
}

// ─── * → free (el que no paga baja al plan gratis) ──────────────────────────
// Freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md): la prueba
// vencida, el final de la mora y la baja voluntaria al vencer lo pagado terminan
// en `free` en vez de `blocked`. Cada origen repite en el WHERE el gate que lo
// habilita, así un caller que se equivoque de origen no mueve la fila.
// `scheduled_deletion_at` se limpia SIEMPRE: un `free` no se borra por falta de
// pago (solo por inactividad, `data-retention-cleanup.worker.ts`), y el wipe
// borraría a cualquier `free` que llegara con el borrado agendado.

export type FreeDowngradeOrigin =
  /** `trialing` con la prueba vencida (el worker ya aplicó el margen de "Activar"). */
  | 'trial_expired'
  /** `suspended` por mora, ≥ 14 días desde el primer cobro fallido. */
  | 'dunning_ended'
  /** `canceled` con el período pagado vencido. */
  | 'cancel_period_ended'
  /** `suspended` sin mora: la prueba vencida en solo lectura del lifecycle anterior. */
  | 'legacy_trial_read_only'
  /** `blocked` sin borrado agendado: prueba vencida o mora del lifecycle anterior. */
  | 'legacy_blocked'

const FREE_DOWNGRADE_SOURCE: Record<
  FreeDowngradeOrigin,
  'trialing' | 'suspended' | 'canceled' | 'blocked'
> = {
  trial_expired: 'trialing',
  dunning_ended: 'suspended',
  cancel_period_ended: 'canceled',
  legacy_trial_read_only: 'suspended',
  legacy_blocked: 'blocked',
}

function freeDowngradeGate(origin: FreeDowngradeOrigin) {
  switch (origin) {
    case 'trial_expired':
      return sql`TRUE`
    case 'dunning_ended':
      return sql`dunning_started_at <= NOW() - (${SUSPENDED_TO_FREE_DAYS} || ' days')::interval`
    case 'cancel_period_ended':
      return sql`current_period_end < NOW()`
    case 'legacy_trial_read_only':
      return sql`dunning_started_at IS NULL`
    case 'legacy_blocked':
      return sql`scheduled_deletion_at IS NULL`
  }
}

export async function transitionToFree(
  tenantId: string,
  origin: FreeDowngradeOrigin,
  tx: DbTx,
): Promise<void> {
  const from = FREE_DOWNGRADE_SOURCE[origin]
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'free'::subscription_status,
        dunning_started_at = NULL,
        scheduled_deletion_at = NULL,
        pending_billed_courts = NULL,
        pending_change_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND status = ${from}
      AND ${freeDowngradeGate(origin)}
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, from, 'free')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'free'::tenant_status,
        scheduled_deletion_at = NULL,
        updated_at = NOW()
    WHERE id = ${tenantId} AND status = ${from}
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.downgraded_to_free',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { from, reason: origin },
  })
}

// ─── blocked → churned (sweep, ≥ 90d in dunning; sets deletion_at = +90d) ──

export async function transitionBlockedToChurned(tenantId: string, tx: DbTx): Promise<void> {
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'churned'::subscription_status,
        scheduled_deletion_at = NOW() + (${CHURNED_DELETION_DAYS} || ' days')::interval,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND status = 'blocked'
      AND dunning_started_at <= NOW() - (${BLOCKED_TO_CHURNED_DAYS} || ' days')::interval
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, 'blocked', 'churned')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'churned'::tenant_status,
        scheduled_deletion_at = NOW() + (${CHURNED_DELETION_DAYS} || ' days')::interval,
        updated_at = NOW()
    WHERE id = ${tenantId} AND status = 'blocked'
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.churned',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { reason: 'dunning_day_90', deletionInDays: CHURNED_DELETION_DAYS },
  })
}

// El estado terminal `deleted` NO tiene función de transición: el borrado real
// (hard-delete de filas hijas + soft-anonymize de tenants + cancel MP) lo hace
// `data-retention-cleanup.worker.ts` con su propio UPDATE, no una transición
// del FSM. Forzar 'deleted' manualmente fue eliminado (ver FORCEABLE_TRANSITIONS
// en support.service.ts) por dejar tenants huérfanos.

// ─── * → canceled (voluntary cancel; period_end intact) ─────────────────────

export async function transitionToCanceled(
  tenantId: string,
  reason: string,
  tx: DbTx,
): Promise<void> {
  // Residual B5 (upgrade/downgrade pendiente stale): un `pending_plan_change`
  // que quedó sin aplicar (webhook de upgrade todavía en vuelo, o downgrade
  // diferido a period_end) no debe sobrevivir la cancelación — si el tenant
  // se reactiva después con otro plan, un CAS tardío (`handleUpgradeApproved`)
  // o el sweep de dunning (`dunning-retry.worker.ts`) lo reaplicarían tarde.
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'canceled'::subscription_status,
        canceled_at = NOW(),
        cancellation_reason = ${reason},
        pending_plan_change = NULL,
        pending_change_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND status IN ('active', 'past_due', 'suspended', 'trialing')
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(tenantId, 'active|past_due|suspended|trialing', 'canceled')
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'canceled'::tenant_status, updated_at = NOW()
    WHERE id = ${tenantId}
      AND status IN ('active', 'past_due', 'suspended', 'trialing')
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.canceled',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { reason },
  })
}

// ─── {canceled,churned,blocked,past_due,suspended,free} → active ───────────
// Reactivate before deletion. Caller (billing.reactivate) has already updated
// plan_id, billing_cycle, mp_subscription_id at preapproval-creation time.

export async function transitionToActiveFromAny(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  tx: DbTx,
): Promise<void> {
  const subResult = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET status = 'active'::subscription_status,
        current_period_start = ${periodStart.toISOString()}::timestamptz,
        current_period_end = ${periodEnd.toISOString()}::timestamptz,
        last_payment_at = NOW(),
        dunning_started_at = NULL,
        last_payment_failed_at = NULL,
        scheduled_deletion_at = NULL,
        canceled_at = NULL,
        cancellation_reason = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
      AND status IN ('canceled', 'churned', 'blocked', 'past_due', 'suspended', 'free')
    RETURNING id
  `)
  if (rowsAffected(subResult) === 0) {
    throw new InvalidTransitionError(
      tenantId,
      'canceled|churned|blocked|past_due|suspended|free',
      'active',
    )
  }
  await tx.execute(sql`
    UPDATE tenants
    SET status = 'active'::tenant_status,
        scheduled_deletion_at = NULL,
        updated_at = NOW()
    WHERE id = ${tenantId}
      AND status IN ('canceled', 'churned', 'blocked', 'past_due', 'suspended', 'free')
  `)
  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'tenant.reactivated',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { periodEnd: periodEnd.toISOString() },
  })
}
