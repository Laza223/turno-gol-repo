import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb, withTenantContext, type DbTx } from '@/shared/db/client'
import { tenants } from '@/shared/db/schema'
import { insertAuditLog, insertSystemAuditLog } from '@/shared/db/audit'
import { REFERRAL_REWARD_CAP } from '@/shared/constants'
import { captureException } from '@/lib/sentry'
import { isTrialCheckoutUnpaid } from '@/modules/billing/billing.service'
import { extendTrialInTx } from '@/modules/super-admin/support.service'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { TenantStatus } from '@/modules/billing/billing.types'

/**
 * Premio del programa de referidos (B3). Reglas: R1/R3/R4/R5 de
 * `docs/decisions/2026-09-26-referidos.md` y el método elegido en
 * `docs/decisions/2026-10-22-referidos-metodo-manual-premio.md`.
 *
 * El estado vive en la fila del REFERIDO (`tenants.referral_reward_status`,
 * CHECK de la migr. 094), el premio lo cobra el REFERIDOR:
 *
 *   NULL ──primer cobro real──▶ earned | over_cap
 *   earned ──founder aprueba──▶ applied        (prueba extendida 30 días)
 *                            └─▶ manual_pending (el founder devuelve el próximo cobro en MP)
 *   manual_pending ──"Ya lo apliqué"──▶ applied
 *   earned | manual_pending ──rechazo──▶ rejected
 *
 * Cada paso es un UPDATE condicionado al estado anterior: un doble click o dos
 * caminos que llegan a la vez (webhook y reconcile) escriben una sola vez.
 */

type ReferralRewardStatus = 'earned' | 'manual_pending' | 'applied' | 'rejected' | 'over_cap'

/** Lo que cuenta para el tope de R1: ganado, aprobado o ya acreditado. */
const COUNTED_STATUSES: ReferralRewardStatus[] = ['earned', 'manual_pending', 'applied']

const REVIEW_STATUSES: ReferralRewardStatus[] = ['earned', 'manual_pending']

/** El mes del premio, cuando se aplica corriendo la prueba (R5). */
const REWARD_TRIAL_DAYS = 30

/** Un referidor en estos estados ya no tiene cuenta vigente (`/terminos` §7, cláusula 1). */
const INACTIVE_REFERRER_STATUSES: TenantStatus[] = ['canceled', 'churned', 'deleted']

// ─── Detección (R3) ──────────────────────────────────────────────────────────

/**
 * Marca el premio del referidor cuando ESTE complejo (el referido) paga. Los
 * únicos callers son los dos caminos de un cobro real de MP: el webhook
 * (`dunning.service.ts:onPaymentApproved`) y el reconcile. Soporte forzando
 * `active` no pasa por acá (R3).
 *
 * Se llama en cada cobro; sólo el primero escribe (`referral_reward_status IS
 * NULL` en el WHERE). Corre en un SAVEPOINT y se traga sus errores: un bug de
 * referidos nunca puede revertir el cobro que lo disparó.
 */
export async function markReferralRewardEarned(tenantId: string, tx: DbTx): Promise<void> {
  try {
    await tx.transaction(async (sp) => {
      const rows = (await sp.execute(sql`
        SELECT referred_by_tenant_id
        FROM tenants
        WHERE id = ${tenantId}
          AND referred_by_tenant_id IS NOT NULL
          AND referral_reward_status IS NULL
      `)) as unknown as Array<{ referred_by_tenant_id: string }>
      const referrerId = rows[0]?.referred_by_tenant_id
      if (!referrerId) return

      // Serializa a los referidos del MISMO referidor: sin esto, dos cobros
      // simultáneos cuentan 5 cada uno y el tope de 6 termina en 7.
      await sp.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`referral-reward:${referrerId}`}))`,
      )

      const counted = (await sp.execute(sql`
        SELECT count(*)::int AS n
        FROM tenants
        WHERE referred_by_tenant_id = ${referrerId}
          AND referral_reward_status IN (${sql.join(
            COUNTED_STATUSES.map((s) => sql`${s}`),
            sql`, `,
          )})
      `)) as unknown as Array<{ n: number }>
      const status: ReferralRewardStatus =
        (counted[0]?.n ?? 0) >= REFERRAL_REWARD_CAP ? 'over_cap' : 'earned'

      const updated = (await sp.execute(sql`
        UPDATE tenants
        SET referral_reward_status = ${status}, referral_reward_at = NOW(), updated_at = NOW()
        WHERE id = ${tenantId}
          AND referred_by_tenant_id = ${referrerId}
          AND referral_reward_status IS NULL
        RETURNING id
      `)) as unknown as Array<{ id: string }>
      if (updated.length === 0) return

      await insertSystemAuditLog(sp, {
        tenantId,
        action: 'referral.reward_earned',
        resourceType: 'tenant',
        resourceId: tenantId,
        metadata: { referrerTenantId: referrerId, status },
      })
    })
  } catch (err) {
    // Corre en el camino de un cobro: ni siquiera el reporte puede tirar.
    try {
      captureException(err, { tags: { area: 'referrals' }, extra: { tenantId } })
    } catch {
      // sin reporte; el cobro sigue
    }
  }
}

// ─── Lista para el founder (R4) ──────────────────────────────────────────────

export type ReferralRewardForReview = {
  referredTenantId: string
  referredName: string
  status: 'earned' | 'manual_pending'
  statusAt: Date | null
  referrerTenantId: string | null
  referrerName: string | null
  referrerStatus: TenantStatus | null
  referrerTrialEndsAt: Date | null
}

/**
 * Premios que esperan una acción del founder. `tenants` es global y sin RLS:
 * la proyección explícita es la única barrera contra devolver de más.
 */
export async function listReferralRewardsForReview(): Promise<ReferralRewardForReview[]> {
  const referrer = alias(tenants, 'referrer')
  const rows = await getDb()
    .select({
      referredTenantId: tenants.id,
      referredName: tenants.name,
      status: tenants.referralRewardStatus,
      statusAt: tenants.referralRewardAt,
      referrerTenantId: referrer.id,
      referrerName: referrer.name,
      referrerStatus: referrer.status,
      referrerTrialEndsAt: referrer.trialEndsAt,
    })
    .from(tenants)
    .leftJoin(referrer, eq(referrer.id, tenants.referredByTenantId))
    .where(inArray(tenants.referralRewardStatus, REVIEW_STATUSES))
    .orderBy(asc(tenants.referralRewardAt))

  return rows.map((r) => ({
    ...r,
    status: r.status === 'manual_pending' ? 'manual_pending' : 'earned',
  }))
}

// ─── Aprobación (R4 + R5) ────────────────────────────────────────────────────

type RewardApplication = 'extend_trial' | 'manual'

/**
 * Cómo se aplica el mes (R5 refinado el 2026-10-22). Automático sólo si el
 * referidor está en prueba y MP no tiene nada que cobrarle: sin preapproval, o
 * con un checkout que nunca se pagó (El Vagón). Para eso el id que se miró en
 * MP tiene que ser el mismo que sigue guardado: si cambió en el medio (activó
 * el plan), lo que dijo MP ya no vale.
 */
export function decideRewardApplication(input: {
  referrerStatus: TenantStatus
  mpSubscriptionId: string | null
  checkedMpSubscriptionId: string | null
  checkoutUnpaid: boolean
}): RewardApplication {
  if (input.referrerStatus !== 'trialing') return 'manual'
  if (input.mpSubscriptionId === null) return 'extend_trial'
  if (input.mpSubscriptionId === input.checkedMpSubscriptionId && input.checkoutUnpaid) {
    return 'extend_trial'
  }
  return 'manual'
}

export type ApproveReferralRewardResult =
  | { ok: true; applied: 'trial_extended'; trialEndsAt: Date }
  | { ok: true; applied: 'manual_pending' }
  | { ok: false; reason: 'not_found' | 'already_processed' | 'referrer_inactive' }

type ReferredRow = { referrerId: string | null; status: string | null }

async function loadReferred(referredTenantId: string): Promise<ReferredRow | null> {
  const rows = await getDb()
    .select({
      referrerId: tenants.referredByTenantId,
      status: tenants.referralRewardStatus,
    })
    .from(tenants)
    .where(eq(tenants.id, referredTenantId))
    .limit(1)
  return rows[0] ?? null
}

/**
 * El click de "Aprobar" del founder. La consulta a MP (¿el checkout sigue sin
 * pagar?) va ANTES y fuera de la transacción; adentro se relee todo con lock
 * (Orden A: `tenant_subscriptions` antes que `tenants`) y se decide de nuevo.
 */
export async function approveReferralReward(
  referredTenantId: string,
  systemAdminId: string,
  gateway: PaymentGateway,
  now: Date = new Date(),
): Promise<ApproveReferralRewardResult> {
  const referred = await loadReferred(referredTenantId)
  if (!referred) return { ok: false, reason: 'not_found' }
  if (referred.status !== 'earned') return { ok: false, reason: 'already_processed' }
  const referrerId = referred.referrerId
  if (!referrerId) return { ok: false, reason: 'referrer_inactive' }

  const before = await withTenantContext(referrerId, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT t.status, s.mp_subscription_id
      FROM tenants t
      LEFT JOIN tenant_subscriptions s ON s.tenant_id = t.id
      WHERE t.id = ${referrerId}
    `)) as unknown as Array<{ status: TenantStatus; mp_subscription_id: string | null }>
    return rows[0] ?? null
  })
  if (!before || INACTIVE_REFERRER_STATUSES.includes(before.status)) {
    return { ok: false, reason: 'referrer_inactive' }
  }

  const checkedMpSubscriptionId = before.status === 'trialing' ? before.mp_subscription_id : null
  const checkoutUnpaid = checkedMpSubscriptionId
    ? await isTrialCheckoutUnpaid(referrerId, checkedMpSubscriptionId, gateway)
    : false

  return withTenantContext(referrerId, async (tx) => {
    const subRows = (await tx.execute(sql`
      SELECT mp_subscription_id FROM tenant_subscriptions
      WHERE tenant_id = ${referrerId}
      FOR UPDATE
    `)) as unknown as Array<{ mp_subscription_id: string | null }>
    const tenantRows = (await tx.execute(sql`
      SELECT status FROM tenants WHERE id = ${referrerId} FOR UPDATE
    `)) as unknown as Array<{ status: TenantStatus }>
    const referrerStatus = tenantRows[0]?.status
    if (!referrerStatus || INACTIVE_REFERRER_STATUSES.includes(referrerStatus)) {
      return { ok: false, reason: 'referrer_inactive' } as const
    }

    const application = decideRewardApplication({
      referrerStatus,
      mpSubscriptionId: subRows[0]?.mp_subscription_id ?? null,
      checkedMpSubscriptionId,
      checkoutUnpaid,
    })
    const nextStatus: ReferralRewardStatus =
      application === 'extend_trial' ? 'applied' : 'manual_pending'

    // El CAS va antes de extender: un segundo click no encuentra `earned` y
    // sale sin correr la prueba otra vez.
    const claimed = (await tx.execute(sql`
      UPDATE tenants
      SET referral_reward_status = ${nextStatus},
          referral_reward_at = ${now.toISOString()}::timestamptz,
          updated_at = NOW()
      WHERE id = ${referredTenantId}
        AND referred_by_tenant_id = ${referrerId}
        AND referral_reward_status = 'earned'
      RETURNING id
    `)) as unknown as Array<{ id: string }>
    if (claimed.length === 0) return { ok: false, reason: 'already_processed' } as const

    if (application === 'extend_trial') {
      const trial = await extendTrialInTx(tx, referrerId, REWARD_TRIAL_DAYS, now)
      await rewardAudit(tx, systemAdminId, referrerId, 'referral.reward_applied', {
        referredTenantId,
        method: 'trial_extended',
        days: REWARD_TRIAL_DAYS,
        before: { trialEndsAt: trial.before?.toISOString() ?? null },
        after: { trialEndsAt: trial.after.toISOString() },
        leftPendingMpSubscriptionId: checkedMpSubscriptionId,
      })
      return { ok: true, applied: 'trial_extended', trialEndsAt: trial.after } as const
    }

    await rewardAudit(tx, systemAdminId, referrerId, 'referral.reward_approved', {
      referredTenantId,
      method: 'refund_next_charge',
    })
    return { ok: true, applied: 'manual_pending' } as const
  })
}

// ─── Cierre a mano (método A) y rechazo ──────────────────────────────────────

export type CloseReferralRewardResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'already_processed' }

/** "Ya lo apliqué": el founder devolvió el cobro en el panel de MP. */
export async function markReferralRewardApplied(
  referredTenantId: string,
  systemAdminId: string,
): Promise<CloseReferralRewardResult> {
  const referred = await loadReferred(referredTenantId)
  if (!referred) return { ok: false, reason: 'not_found' }
  const referrerId = referred.referrerId
  if (!referrerId || referred.status !== 'manual_pending') {
    return { ok: false, reason: 'already_processed' }
  }

  return withTenantContext(referrerId, async (tx) => {
    const updated = await tx
      .update(tenants)
      .set({ referralRewardStatus: 'applied', referralRewardAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tenants.id, referredTenantId),
          eq(tenants.referredByTenantId, referrerId),
          eq(tenants.referralRewardStatus, 'manual_pending'),
        ),
      )
      .returning({ id: tenants.id })
    if (updated.length === 0) return { ok: false, reason: 'already_processed' } as const

    await rewardAudit(tx, systemAdminId, referrerId, 'referral.reward_applied', {
      referredTenantId,
      method: 'refund_next_charge',
    })
    return { ok: true } as const
  })
}

/**
 * "No corresponde" (R4: el founder frena un premio trucho). El rastro queda en
 * el REFERIDO: es el único lado que sigue existiendo si el referidor se borró.
 */
export async function rejectReferralReward(
  referredTenantId: string,
  systemAdminId: string,
): Promise<CloseReferralRewardResult> {
  const referred = await loadReferred(referredTenantId)
  if (!referred) return { ok: false, reason: 'not_found' }

  return withTenantContext(referredTenantId, async (tx) => {
    const updated = await tx
      .update(tenants)
      .set({
        referralRewardStatus: 'rejected',
        referralRewardAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenants.id, referredTenantId),
          inArray(tenants.referralRewardStatus, REVIEW_STATUSES),
        ),
      )
      .returning({ id: tenants.id })
    if (updated.length === 0) return { ok: false, reason: 'already_processed' } as const

    await rewardAudit(tx, systemAdminId, referredTenantId, 'referral.reward_rejected', {
      referrerTenantId: referred.referrerId,
      previousStatus: referred.status,
    })
    return { ok: true } as const
  })
}

function rewardAudit(
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
