import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { CreatePreapprovalInput, PreapprovalResult } from '@/modules/payments/payment.types'
import {
  isMpInvalidPayerError,
  isMpAlreadyCancelledPreapprovalError,
} from '@/modules/payments/mp-token-refresh'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { captureMessage } from '@/lib/sentry'
import {
  DowngradeBlockedError,
  InvalidPayerEmailError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
  UpgradeAlreadyPendingError,
} from './billing.errors'
import { transitionToCanceled } from './lifecycle.service'
import { track } from '@/shared/observability'
import type {
  BillingCycle,
  CancelResult,
  DowngradeResult,
  PlanSummary,
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

/**
 * Planes activos ordenados (selector de "Activar plan" — Fix 1b). Mismo
 * patrón que `loadPlan`: SQL crudo sobre la tx del caller. `plans` es tabla
 * global sin RLS, así que no depende de que `app.current_tenant_id` esté seteado.
 */
export async function listActivePlans(tx: DbTx): Promise<PlanSummary[]> {
  const rows = await tx.execute(sql`
    SELECT id, slug, name, max_courts AS "maxCourts",
           price_monthly AS "priceMonthly", price_annual AS "priceAnnual"
    FROM plans
    WHERE is_active = true
    ORDER BY sort_order
  `)
  return rows as unknown as PlanSummary[]
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

/**
 * B5 (🔴 huérfano MP↔DB): mismas columnas y forma de retorno que `loadSub`,
 * pero con `FOR UPDATE` — usada por `subscribe()`/`reactivate()`, que leen el
 * estado, tocan MP (efecto externo irreversible) y recién después escriben.
 * Sin lock, dos llamadas concurrentes sobre el mismo tenant (doble click, o
 * un re-subscribe durante el trial) leen ambas el mismo estado, crean CADA
 * UNA un preapproval en MP, y el UPDATE local solo guarda el último id — el
 * otro preapproval queda huérfano en MP, cobrando sin que la DB lo
 * referencie. El `FOR UPDATE` serializa: la segunda tx bloquea hasta que la
 * primera commitea, y ve el `mp_subscription_id` que la primera dejó. Sin
 * `LIMIT` (tenant_id es único y `FOR UPDATE` + `LIMIT` es frágil); el
 * `[0] ?? null` ya maneja "no hay fila". Mismo patrón que
 * `support.service.ts:loadSubForUpdate`. `loadSub` (lecturas read-only como
 * `getSubscriptionState`) queda intacto — no debe lockear.
 */
async function loadSubForUpdate(tenantId: string, tx: DbTx): Promise<SubRow | null> {
  const rows = await tx.execute(sql`
    SELECT status, plan_id, billing_cycle,
           current_period_start, current_period_end,
           mp_subscription_id, pending_plan_change, pending_change_at,
           canceled_at, cancellation_reason, scheduled_deletion_at,
           dunning_started_at, last_payment_failed_at, last_payment_at
    FROM tenant_subscriptions
    WHERE tenant_id = ${tenantId}
    FOR UPDATE
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
  return (
    (
      rows as unknown as Array<{
        tenantName: string
        ownerName: string | null
        ownerEmail: string | null
      }>
    )[0] ?? null
  )
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

/**
 * Webhook URL para TODO lo que se cobra por la cuenta MASTER de TurnoGol
 * (suscripción SaaS y proraeo de upgrade), a diferencia de las señas de
 * reserva, que se cobran por el MP del complejo (ADR-004).
 *
 * El `&source=saas` es el discriminador que el handler necesita para elegir
 * la cuenta correcta (TG-P1-MP-02). Sin él, un `payment` de proraeo entra por
 * la rama de seña y se consulta con el token del complejo contra un pago que
 * vive en la cuenta master: MP no lo encuentra y el upgrade nunca se aplica
 * aunque el dueño ya haya pagado. El tipo del evento NO alcanza como
 * discriminador: el proraeo llega como `payment`, igual que una seña.
 *
 * No se confía a ciegas: el handler exige que el `external_reference` del pago
 * efectivamente parsee como referencia de upgrade, y que el tenant que declara
 * la URL coincida con el embebido en esa referencia.
 */
function computeNotificationUrl(tenantId: string): string {
  return `${process.env.APP_URL ?? 'http://localhost:3000'}/api/webhooks/mercadopago?tenant=${tenantId}&source=saas`
}

/**
 * ENS-23: subscribe() y reactivate() comparten esta llamada a MP. Si el
 * `payer_email` (email del dueño) no tiene cuenta de MercadoPago, MP la
 * rechaza con "Both payer and collector must be real or test users" — sin
 * este catch, un `MpGatewayError` técnico burbujeaba hasta un 500 críptico en
 * `ActivatePlanSection`. Cualquier OTRO error de MP (red, rate limit, etc.)
 * sigue burbujeando sin tocar.
 */
async function createPreapprovalOrThrowFriendly(
  gateway: PaymentGateway,
  input: CreatePreapprovalInput,
): Promise<PreapprovalResult> {
  try {
    return await gateway.createPreapproval(input)
  } catch (err) {
    if (isMpInvalidPayerError(err)) {
      throw new InvalidPayerEmailError(input.tenantId, input.payerEmail)
    }
    throw err
  }
}

// ─── subscribe ──────────────────────────────────────────────────────────────

export async function subscribe(
  tenantId: string,
  planId: string,
  billingCycle: BillingCycle,
  gateway: PaymentGateway,
  tx: DbTx,
): Promise<SubscribeResult> {
  const sub = await loadSubForUpdate(tenantId, tx)
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

  // B5 (🔴 huérfano MP↔DB): un `mp_subscription_id` previo significa que un
  // subscribe anterior (re-subscribe durante el trial, o el perdedor de una
  // carrera concurrente ahora serializada por el `FOR UPDATE` de
  // `loadSubForUpdate`) ya dejó un preapproval vivo en MP. Sin este cancel,
  // pedir uno nuevo lo pisa en la DB sin apagarlo — queda huérfano cobrando.
  // Mismo patrón que `reactivate()` (líneas más abajo): tolera "ya estaba
  // cancelado en MP" (`isMpAlreadyCancelledPreapprovalError`), cualquier otro
  // error aborta el subscribe entero.
  if (sub.mp_subscription_id) {
    try {
      await gateway.cancelPreapproval(sub.mp_subscription_id)
    } catch (err) {
      if (!isMpAlreadyCancelledPreapprovalError(err)) throw err
    }
  }

  const preapproval = await createPreapprovalOrThrowFriendly(gateway, {
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
  // B5 (🔴 huérfano MP↔DB, misma causa raíz que en `cancel()`): `loadSubForUpdate`
  // en vez de `loadSub` — la proración/monto se calculan sobre una lectura
  // lockeada, serializada contra `subscribe()`/`reactivate()`/`cancel()`
  // concurrentes sobre la misma fila.
  const sub = await loadSubForUpdate(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)
  if (sub.status !== 'active') {
    throw new ReactivateNotAllowedError(tenantId, sub.status)
  }
  // 01-billing-upgrade-dedup: sin este guard, una segunda llamada pisaba
  // `pending_plan_change` (y creaba una preferencia MP nueva) sin invalidar
  // la anterior — si el pago viejo se acreditaba después, el CAS de
  // `handleUpgradeApproved` ya no matcheaba y ese pago quedaba huérfano.
  if (sub.pending_plan_change) {
    throw new UpgradeAlreadyPendingError(tenantId, sub.pending_plan_change)
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
  mpPaymentId?: string,
): Promise<void> {
  track.payment('payment.saas.upgrade.approved', { tenantId })

  const sub = await loadSub(tenantId, tx)
  if (!sub) return // tenant gone — nothing to do
  if (sub.status !== 'active') return
  if (sub.pending_plan_change !== targetPlanId) return // race / stale event

  const targetPlan = await loadPlan(targetPlanId, tx)
  if (!targetPlan) return

  const newAmount = planAmount(targetPlan, sub.billing_cycle)

  // B4: el UPDATE local es el gate atómico — corre ANTES de tocar MP.
  // El WHERE repite `status = 'active' AND pending_plan_change = targetPlanId`
  // (los mismos guards de arriba, pero como condición de escritura): si entre
  // el loadSub y este UPDATE una tx concurrente (ej. el sweep de dunning)
  // sacó a la suscripción de ese estado, o un webhook duplicado ya consumió
  // el pending_plan_change, el UPDATE afecta 0 filas y MP nunca se toca —
  // evita la divergencia MP↔DB (mismo patrón que support.service.changePlanForSupport).
  const updated = await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET plan_id = ${targetPlanId},
        pending_plan_change = NULL,
        pending_change_at = NULL,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND status = 'active' AND pending_plan_change = ${targetPlanId}
    RETURNING id
  `)
  if ((updated as unknown as Array<{ id: string }>).length === 0) {
    // 01-billing-upgrade-dedup: este pago se acreditó pero el gate atómico no
    // matcheó — o el `pending_plan_change` ya fue sobreescrito por una
    // llamada posterior a `upgrade()`, o la sub salió de `status='active'`
    // entre el `loadSub` y este UPDATE. MP ya cobró esa plata; sin esto se
    // perdía en silencio. Mismo patrón que
    // dunning.service.ts:onPaymentApproved (preapprovalIdMatches).
    captureMessage(
      'handleUpgradeApproved: CAS UPDATE affected 0 rows — an approved upgrade payment did not match the tenant current pending_plan_change/status; left for manual reconciliation',
      {
        level: 'warning',
        extra: {
          tenantId,
          targetPlanId,
          pendingPlanChange: sub.pending_plan_change,
          mpPaymentId: mpPaymentId ?? null,
        },
      },
    )
    return
  }

  await insertSystemAuditLog(tx, {
    tenantId,
    action: 'subscription.upgrade_completed',
    resourceType: 'tenant_subscription',
    resourceId: tenantId,
    metadata: { fromPlanId: sub.plan_id, toPlanId: targetPlanId },
  })

  // MP último: cualquier fallo previo rollbackea limpio (nada se tocó fuera
  // de esta tx); si esta llamada falla, la tx entera (UPDATE + audit)
  // rollbackea y el webhook reintenta (lock en `processed_webhooks`,
  // mp-webhook.handler.ts).
  if (sub.mp_subscription_id) {
    await gateway.updatePreapprovalAmount(sub.mp_subscription_id, newAmount)
  }
}

// ─── downgrade (deferred to period end) ─────────────────────────────────────

export async function downgrade(
  tenantId: string,
  targetPlanId: string,
  tx: DbTx,
): Promise<DowngradeResult> {
  // B5 (🔴 huérfano MP↔DB, misma causa raíz que en `cancel()`): `loadSubForUpdate`
  // en vez de `loadSub` — cierra el race sobre `pending_plan_change` y el
  // `fromPlanId` del audit contra `subscribe()`/`reactivate()`/`cancel()`
  // concurrentes. Sin llamada a MP acá, pero la fila igual se serializa.
  const sub = await loadSubForUpdate(tenantId, tx)
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
  // B5 (🔴 huérfano MP↔DB, causa raíz): `loadSub` (SIN lock) dejaba leer acá
  // un `mp_subscription_id` STALE — si un `subscribe()`/`reactivate()`
  // concurrente (que SÍ locquea con `loadSubForUpdate`) escribía un
  // preapproval nuevo entre esta lectura y el UPDATE de limpieza de abajo, el
  // `canceledMpSubscriptionId` capturado acá quedaba apuntando al preapproval
  // VIEJO; `cancelPreapproval` cancelaba el viejo (ya cancelado por el otro
  // lado) y el UPDATE de limpieza pisaba `mp_subscription_id` a NULL sin
  // cancelar el NUEVO — huérfano vivo en MP, cobrando sin referencia en la
  // DB. `loadSubForUpdate` serializa: esta tx sostiene el lock desde acá
  // hasta el commit, así que `sub.mp_subscription_id` (y todo lo que se
  // deriva de él, incluido `transitionToCanceled` más abajo) siempre refleja
  // el último estado escrito, gane quien gane la carrera.
  const sub = await loadSubForUpdate(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)

  const canceledMpSubscriptionId = sub.mp_subscription_id

  // B1 (🔴 divergencia MP↔DB): la FSM corre PRIMERO, antes de tocar MP. Si el
  // tenant está en un estado no cancelable (ej. `blocked` — el sweep de
  // dunning no limpia `mp_subscription_id`), `transitionToCanceled` tira acá
  // y `cancelPreapproval` NUNCA se llama: MP queda intacto, sin divergencia.
  // Si el estado sí es cancelable pero el gateway falla más abajo, la
  // atomicidad ("todo o nada") ya no depende del orden de llamadas sino del
  // rollback de la tx del caller: este UPDATE se deshace junto con todo lo
  // demás.
  await transitionToCanceled(tenantId, reason, tx)

  if (canceledMpSubscriptionId) {
    // Mismo riesgo menor que `reactivate()` (R5 lo señaló, ver Fix 1 más
    // abajo): improbable acá (nadie más cancela el preapproval de este
    // tenant entre lecturas), pero tolerar "ya estaba cancelado en MP" tiene
    // costo cero y evita que una baja voluntaria reintentada por el dueño
    // (ej. doble click, timeout de red en el primer intento que sí llegó a
    // MP) quede trabada en el mismo error 400 que R2-2.
    try {
      await gateway.cancelPreapproval(canceledMpSubscriptionId)
    } catch (err) {
      if (!isMpAlreadyCancelledPreapprovalError(err)) throw err
    }

    // Fix 2a (R2 🔴, mitad 1 de "un pago en vuelo no deshace una baja
    // voluntaria"): sin esto, un pago del preapproval VIEJO (cancelado
    // arriba, pero autorizado por MP antes del cancel — "en vuelo") que
    // llega tarde vía webhook encontraría `mp_subscription_id` todavía
    // apuntando a él y `onPaymentApproved` (dunning.service.ts, Fix 2b) lo
    // tomaría como "la suscripción actual" y reactivaría solo, sin que el
    // dueño lo haya pedido (viola ENS-25/26, Res. 424/2020).
    // `transitionToCanceled` (lifecycle.service.ts) ya audita
    // 'tenant.canceled' con {reason}; ese archivo queda fuera del alcance de
    // este fix, así que este es un UPDATE + audit log SEGUNDO y dedicado —
    // misma tx que `transitionToCanceled` arriba (todo-o-nada por rollback).
    // El `WHERE status = 'canceled'` sigue siendo correcto: para cuando se
    // llega acá, `transitionToCanceled` ya dejó el status en 'canceled'.
    // Preserva el id cancelado en el audit trail antes de borrarlo.
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET mp_subscription_id = NULL, updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND status = 'canceled'
    `)
    await insertSystemAuditLog(tx, {
      tenantId,
      action: 'subscription.mp_preapproval_cleared',
      resourceType: 'tenant_subscription',
      resourceId: tenantId,
      metadata: { canceledMpSubscriptionId },
    })
  }

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

// ─── reactivate (canceled/churned/suspended/blocked, before deletion_at) ────

export async function reactivate(
  tenantId: string,
  planId: string,
  billingCycle: BillingCycle,
  gateway: PaymentGateway,
  tx: DbTx,
  now: Date = new Date(),
): Promise<SubscribeResult> {
  const sub = await loadSubForUpdate(tenantId, tx)
  if (!sub) throw new SubscriptionNotFoundError(tenantId)

  // ENS-20: se suman `suspended` y `blocked` — doc4 §2 los clasifica como
  // "Reintento manual" y "Re-activación" respectivamente, así que necesitan el
  // mismo botón de "pagar ahora" que ya tenían canceled/churned. `past_due`
  // queda deliberadamente afuera: todavía tiene un preapproval de MP vivo
  // reintentando automáticamente (doc4: "Reintento automático", día 0/2/5);
  // pedir uno nuevo acá arriesgaría un doble cobro si el viejo también termina
  // aprobándose. onPaymentApproved ya reactiva sea cual sea el origen
  // (transitionToActiveFromAny) una vez que ESE pago se acredita.
  const allowed: SubscriptionStatus[] = ['canceled', 'churned', 'suspended', 'blocked']
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

  // Fix 1 (R2 🔴): el preapproval VIEJO puede seguir vivo en MP reintentando
  // — el sweep de dunning (dunning-retry.worker.ts) solo escala estado
  // local, JAMÁS llama a MP para cancelarlo (comentario en ese archivo: "MP
  // itself handles charge retries ... this sweep only escalates state").
  // Sin este cancel, pedir un preapproval nuevo pisa `mp_subscription_id` sin
  // apagar el viejo → dos preapprovals cobrando el mismo plan. Mismo patrón
  // que `cancel()` (arriba).
  //
  // "Ya estaba cancelado en MP" (Fix 1, R2-2 residual — reviewer R5, verificado
  // contra MP real por el orquestador 2026-07-14, ver ENSAYO_GENERAL.md): SÍ
  // lo distinguimos ahora. Escenario real: este mismo cancel corre, tiene
  // éxito en MP (efecto externo NO transaccional — no hay rollback posible),
  // pero `createPreapprovalOrThrowFriendly` de más abajo falla justo después
  // → el rollback local de la tx deja `mp_subscription_id` intacto, apuntando
  // a un preapproval que YA está `cancelled` en MP. El reintento del dueño
  // vuelve a pasar por acá y MP rechaza el segundo cancel con HTTP 400 "You
  // can not modify a cancelled preapproval." — sin esta tolerancia, el dueño
  // queda trabado para siempre en el único flujo cuya razón de ser es
  // dejarlo pagar. `isMpAlreadyCancelledPreapprovalError` matchea por mensaje
  // (mismo patrón que `isMpInvalidPayerError`, validado contra la respuesta
  // real de MP — no una suposición sobre el shape del SDK). El objetivo de
  // este cancel ("el viejo no está vivo") ya se cumplió, así que se tolera y
  // seguimos. Cualquier OTRO error sigue abortando la reactivación entera
  // (bias sin cambios: nunca crear el nuevo con el viejo posiblemente vivo).
  //
  // Con el Fix 2 (`cancel()` limpia `mp_subscription_id` al dar de baja
  // voluntariamente), el único camino real que llega acá con un id no nulo
  // es: reintentos automáticos de MP nunca cancelados (suspended/blocked/
  // churned vía dunning), datos legacy pre-fix, o el escenario de arriba
  // (rollback tras un cancel exitoso); una baja voluntaria previa normal ya
  // no deja nada que cancelar (ver test dedicado).
  if (sub.mp_subscription_id) {
    try {
      await gateway.cancelPreapproval(sub.mp_subscription_id)
    } catch (err) {
      if (!isMpAlreadyCancelledPreapprovalError(err)) throw err
    }
  }

  const preapproval = await createPreapprovalOrThrowFriendly(gateway, {
    tenantId,
    payerEmail: owner.ownerEmail,
    amount,
    frequency: billingCycle,
    planId,
    reason: `TurnoGol — ${plan.name} (reactivación)`,
    returnUrl: computeReturnUrl(),
    notificationUrl: computeNotificationUrl(tenantId),
  })

  // Residual B5 (upgrade/downgrade pendiente stale): reactivar establece un
  // plan fresco (`planId` arriba, elegido por el dueño ahora); cualquier
  // `pending_plan_change` que haya sobrevivido desde antes del cancel (fix
  // gemelo en `transitionToCanceled`, o legado pre-fix) es stale y no debe
  // reaplicarse tarde vía un CAS de `handleUpgradeApproved` o el sweep de
  // dunning.
  await tx.execute(sql`
    UPDATE tenant_subscriptions
    SET plan_id = ${planId},
        billing_cycle = ${billingCycle}::billing_cycle,
        mp_subscription_id = ${preapproval.preapprovalId},
        pending_plan_change = NULL,
        pending_change_at = NULL,
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

export async function getSubscriptionState(tenantId: string, tx: DbTx): Promise<SubscriptionState> {
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
