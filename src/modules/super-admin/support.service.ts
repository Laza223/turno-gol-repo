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
  transitionTrialingToActive,
} from '@/modules/billing/lifecycle.service'
import {
  cancel as billingCancel,
  loadActivePlan,
  subscriptionAmount,
} from '@/modules/billing/billing.service'
import {
  DowngradeBlockedError,
  InvalidTransitionError,
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
 *   canceled → active     transitionToActiveFromAny
 *   canceled → blocked    transitionCanceledToBlocked (gate: period_end vencido)
 *   churned  → active     transitionToActiveFromAny
 *
 * `canceled` como DESTINO se maneja con `cancelSubscriptionForSupport` (además
 * cancela el preapproval MP), no desde acá. Los gates temporales del FSM se
 * respetan: si no se cumplen, la transición tira InvalidTransitionError.
 *
 * `deleted` NO es forzable desde acá (decisión de producto): forzar 'deleted'
 * marcaba el status sin borrar filas hijas ni cancelar el preapproval MP,
 * dejando al tenant con datos + suscripción MP vivos para siempre (sobre-
 * retención Ley 25.326 + huérfano en MP), porque el sweep de retención excluye
 * `status='deleted'` de sus targets. El borrado real (wipe completo + cancel
 * MP) es responsabilidad EXCLUSIVA del cron de retención
 * (`data-retention-cleanup.worker.ts`), que dispara sobre `scheduled_deletion_at`
 * vencido — nunca manual.
 */
export const FORCEABLE_TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  trialing: ['active'],
  active: ['past_due'],
  past_due: ['active', 'suspended'],
  suspended: ['active', 'blocked'],
  blocked: ['active', 'churned'],
  canceled: ['active', 'blocked'],
  churned: ['active'],
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
  billed_courts: number
  mp_subscription_id: string | null
}

async function loadSubForUpdate(tx: DbTx, tenantId: string): Promise<SubRowLite | null> {
  const rows = await tx.execute(sql`
    SELECT status, plan_id, billing_cycle, billed_courts, mp_subscription_id
    FROM tenant_subscriptions
    WHERE tenant_id = ${tenantId}
    FOR UPDATE
  `)
  return (rows as unknown as SubRowLite[])[0] ?? null
}

/**
 * Mismo texto que `billing.service.billingReason`: es lo que el pagador ve en
 * MercadoPago Y el unico vinculo entre un preapproval y su cantidad de
 * canchas. Si soporte corrige el numero y el `reason` queda viejo, el reuso de
 * checkout pendiente deja de matchear.
 */
function billingReasonForSupport(billedCourts: number, cycle: BillingCycle): string {
  const canchas = billedCourts === 1 ? '1 cancha' : `${billedCourts} canchas`
  return `TurnoGol — ${canchas} (${cycle === 'annual' ? 'anual' : 'mensual'})`
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
      before: {
        trialEndsAt: tenant.trial_ends_at ? toDate(tenant.trial_ends_at).toISOString() : null,
      },
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
    // Orden A de locks: tenant_subscriptions ANTES que tenants (ver Fase 0).
    const sub = await loadSubForUpdate(tx, tenantId)
    const tenant = await loadTenantForUpdate(tx, tenantId)
    const from = tenant.status

    if (!FORCEABLE_TRANSITIONS[from].includes(targetStatus)) {
      throw new InvalidTransitionError(tenantId, from, targetStatus)
    }

    switch (targetStatus) {
      case 'active': {
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
    // Orden A de locks: tenant_subscriptions ANTES que tenants (ver Fase 0).
    const sub = await loadSubForUpdate(tx, tenantId)
    const tenant = await loadTenantForUpdate(tx, tenantId)
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
 * Corrige, desde soporte, por cuántas canchas se le factura a un complejo.
 * Aplica YA y sin cobrar nada.
 *
 * No reusa `billing.changeBilledCourts` a propósito: ese camino agenda el
 * cambio para el próximo ciclo (decisión 2026-09-17, P4) porque es el dueño el
 * que lo pide. Acá es soporte arreglando un número mal cargado, y esperar un
 * mes a que se corrija sería absurdo. El efecto final es el mismo UPDATE más
 * el ajuste del monto en MercadoPago.
 *
 * Antes de la migr. 090/091 esto elegía un plan del catálogo; con precio por
 * cancha el catálogo tiene una sola fila y lo único que se corrige es la
 * cantidad.
 */
export async function changeBilledCourtsForSupport(
  tenantId: string,
  targetBilledCourts: number,
  systemAdminId: string,
  gateway: PaymentGateway,
): Promise<{ fromBilledCourts: number; toBilledCourts: number }> {
  return withTenantContext(tenantId, async (tx) => {
    const sub = await loadSubForUpdate(tx, tenantId)
    if (!sub) throw new SubscriptionNotFoundError(tenantId)
    if (sub.billed_courts === targetBilledCourts) throw new PlanAlreadyAssignedError(tenantId)

    const plan = await loadActivePlan(tx)

    // Mismo invariante que `billing.changeBilledCourts`: no se puede facturar
    // por menos canchas de las que el complejo tiene prendidas.
    const courtRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM courts
      WHERE tenant_id = ${tenantId} AND status = 'online'
    `)
    const courtCount = (courtRows as unknown as Array<{ n: number }>)[0]!.n
    if (targetBilledCourts < courtCount) {
      throw new DowngradeBlockedError(tenantId, courtCount, targetBilledCourts)
    }

    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET billed_courts = ${targetBilledCourts},
          plan_id = ${plan.id},
          pending_plan_change = NULL,
          pending_billed_courts = NULL,
          pending_change_at = NULL,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `)

    // Dentro de la tx (mismo patrón que billing.service): si MP falla, el
    // cambio rollbackea junto con el audit.
    if (sub.mp_subscription_id) {
      const newAmount = subscriptionAmount(plan, targetBilledCourts, sub.billing_cycle)
      await gateway.updatePreapprovalAmount(sub.mp_subscription_id, newAmount, {
        reason: billingReasonForSupport(targetBilledCourts, sub.billing_cycle),
      })
    }

    await supportAudit(tx, systemAdminId, tenantId, 'support.tenant.plan_changed', {
      before: { billedCourts: sub.billed_courts },
      after: { billedCourts: targetBilledCourts },
      mpAmountUpdated: sub.mp_subscription_id !== null,
    })

    return { fromBilledCourts: sub.billed_courts, toBilledCourts: targetBilledCourts }
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
    // Orden A de locks: tenant_subscriptions ANTES que tenants (ver Fase 0).
    // El resultado no se usa acá — billingCancel vuelve a leer/lockear la
    // fila internamente; el único propósito es adquirir el lock primero.
    await loadSubForUpdate(tx, tenantId)
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

export async function updateTenantMarketplaceVisibility(
  tenantId: string,
  visible: boolean,
  systemAdminId: string,
): Promise<void> {
  const db = getDb()
  const rows = await db.execute(sql`
    UPDATE tenants
    SET marketplace_visible = ${visible}, updated_at = now()
    WHERE id = ${tenantId}
    RETURNING marketplace_visible
  `)
  if ((rows as unknown[]).length === 0) {
    throw new TenantNotFoundError(tenantId)
  }

  await withTenantContext(tenantId, async (tx) => {
    await supportAudit(
      tx,
      systemAdminId,
      tenantId,
      'support.tenant.marketplace_visibility_updated',
      { visible },
    )
  })
}
