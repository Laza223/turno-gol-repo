import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { captureMessage } from '@/lib/sentry'
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

/**
 * Fase 2 (🔴 TOCTOU webhook↔reactivate): antes lockeaba nada (`loadSub` plano)
 * — un `onPaymentApproved`/`onPaymentRejected` concurrente con un
 * `reactivate()`/`subscribe()`/`cancel()` (que sí lockean via
 * `billing.service.ts:loadSubForUpdate`) podía leer un `mp_subscription_id`
 * STALE y decidir `preapprovalIdMatches`/la transición de la FSM sobre un
 * valor que otra tx estaba a punto de pisar — activando (o no) la
 * suscripción sobre un preapproval que ya no es el vigente.
 *
 * `FOR UPDATE OF ts` (no `FOR UPDATE` pelado): el SELECT hace JOIN con
 * `plans`, tabla GLOBAL sin tenant_id compartida por todos los tenants del
 * mismo plan. Un `FOR UPDATE` sin `OF` lockearía también la fila de `plans`
 * — serializaría tenants no relacionados entre sí (y arriesgaría deadlock
 * con cualquier otra tx que toque `plans` en otro orden). `OF ts` restringe
 * el lock a `tenant_subscriptions`, la única tabla que este handler escribe.
 *
 * `LIMIT 1` + `FOR UPDATE OF ts`: `tenant_id` es único en `tenant_subscriptions`
 * y el JOIN con `plans` es 1:1 (una sola fila candidata) — a diferencia de
 * `billing.service.ts:loadSubForUpdate` (que saca el `LIMIT` por prudencia),
 * acá no hay ambigüedad sobre qué fila lockear.
 */
async function loadSub(tenantId: string, tx: DbTx): Promise<SubRow | null> {
  const rows = await tx.execute(sql`
    SELECT ts.status, ts.billing_cycle, ts.current_period_end,
           ts.mp_subscription_id, p.name AS plan_name
    FROM tenant_subscriptions ts
    JOIN plans p ON p.id = ts.plan_id
    WHERE ts.tenant_id = ${tenantId}
    LIMIT 1
    FOR UPDATE OF ts
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
 * Fix 2b (R2 🔴 — "un pago en vuelo no deshace una baja voluntaria"):
 * `preapprovalId` es el preapproval que MP asocia al pago aprobado
 * (`point_of_interaction.linked_to` en la respuesta de `getPaymentStatus`
 * — ver `mp-gateway.implementation.ts`); `currentMpSubscriptionId` es
 * `tenant_subscriptions.mp_subscription_id` HOY.
 *
 * `undefined` = el caller no conoce/no verificó el preapproval del pago
 * (callers preexistentes que llaman esta función directo, sin pasar por
 * `mp-webhook.handler.ts` — tests de FSM/idempotencia, o una respuesta real
 * de MP que no trae el campo) → confiamos en la máquina de estados como
 * antes de este fix (retrocompatible, nunca rompe un caller que no optó por
 * el chequeo).
 *
 * `null` o un id distinto de `currentMpSubscriptionId` = el caller SÍ
 * verificó y no matchea (incluye el caso central: `cancel()` puso
 * `mp_subscription_id = NULL` — Fix 2a — así que CUALQUIER preapproval en el
 * pago es, por definición, uno viejo) → no confiar, no reactivar.
 */
function preapprovalIdMatches(
  currentMpSubscriptionId: string | null,
  preapprovalId: string | null | undefined,
): boolean {
  if (preapprovalId === undefined) return true
  return preapprovalId !== null && preapprovalId === currentMpSubscriptionId
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

  // Fase 2 (🔴 TOCTOU): `loadSub` ahora lockea (`FOR UPDATE OF ts`) — si un
  // `reactivate()`/`subscribe()`/`cancel()` concurrente tiene la fila
  // lockeada, este SELECT espera y lee el estado FRESCO al desbloquearse, en
  // vez de decidir la rama de abajo sobre un `status` que la otra tx está
  // por pisar.
  const sub = await loadSub(tenantId, tx)
  if (!sub) return { alreadyProcessed: false }

  if (sub.status === 'active') {
    await transitionActiveToPastDue(tenantId, failedAt, tx)
  } else if (sub.status === 'past_due' || sub.status === 'suspended' || sub.status === 'blocked') {
    // Guard de status en el WHERE (defensa en profundidad): con el `FOR
    // UPDATE OF ts` de arriba ya no hay ventana entre la lectura y este
    // UPDATE, pero repetir la condición que decidió esta rama deja el UPDATE
    // consistente con lo que se leyó — nunca toca `last_payment_failed_at` de
    // una fila que (por algún camino no contemplado) ya no está en uno de
    // estos 3 estados.
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET last_payment_failed_at = ${failedAt.toISOString()}::timestamptz,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND status IN ('past_due', 'suspended', 'blocked')
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
 *   - suspended/blocked/churned/canceled → active (late recovery)
 *   - active    → no transition; just extend period + bump last_payment_at
 *
 * ENS-20: `canceled` solía ser no-op ("preapproval debería estar cancelada en
 * MP, ignorar") asumiendo que un tenant `canceled` nunca vuelve a generar un
 * `subscription_authorized_payment`. Falso desde que billing.service.reactivate()
 * permite pedir un preapproval NUEVO desde canceled/churned/suspended/blocked
 * (recovery por UI, /reactivar): ese pago SÍ dispara este webhook, y quedaba
 * ignorado — el tenant pagaba y seguía bloqueado. transitionToActiveFromAny ya
 * soporta las 5 fuentes (canceled/churned/blocked/past_due/suspended).
 *
 * Fix 2b (R2 🔴): antes de tocar la FSM, `preapprovalIdMatches` verifica que
 * el preapproval del PAGO sea el vigente en la fila — sin esto, un pago
 * aprobado "en vuelo" de un preapproval que el dueño YA canceló
 * voluntariamente (`cancel()`, Fix 2a, deja `mp_subscription_id = NULL`)
 * reactivaba la suscripción sola, sin su consentimiento (viola ENS-25/26,
 * Res. 424/2020). `mpPaymentId`/`preapprovalId` son parámetros nuevos y
 * OPCIONALES: `mp-webhook.handler.ts` (el único caller real) siempre los
 * pasa; callers preexistentes que no los conocen (tests de FSM/idempotencia)
 * siguen confiando en la máquina de estados como antes — ver
 * `preapprovalIdMatches`.
 */
export async function onPaymentApproved(
  tenantId: string,
  mpEventId: string,
  eventType: string,
  rawPayload: unknown,
  paidAt: Date,
  tx: DbTx,
  mpPaymentId?: string,
  preapprovalId?: string | null,
): Promise<{ alreadyProcessed: boolean }> {
  const fresh = await lockWebhook(mpEventId, eventType, rawPayload, tx)
  if (!fresh) return { alreadyProcessed: true }

  // Fase 2 (🔴 TOCTOU, cierra el residual de Fix 2b): `loadSub` ahora lockea
  // (`FOR UPDATE OF ts`). Sin esto, un `reactivate()` concurrente (que ya
  // lockea via `loadSubForUpdate`) podía commitear un `mp_subscription_id`
  // NUEVO DESPUÉS de que este SELECT ya había leído el VIEJO (sin lock,
  // lectura sucia de facto por el orden de commits) — `preapprovalIdMatches`
  // decidía sobre ese valor stale y un pago del preapproval viejo "en vuelo"
  // podía reactivar el tenant aunque el vigente ya fuera otro. Con el lock
  // sostenido: si `reactivate()`/`subscribe()`/`cancel()` tiene la fila
  // tomada, este SELECT espera hasta el commit y lee el `mp_subscription_id`
  // FRESCO — `preapprovalIdMatches` compara contra el valor correcto.
  const sub = await loadSub(tenantId, tx)
  if (!sub) return { alreadyProcessed: false }

  if (!preapprovalIdMatches(sub.mp_subscription_id, preapprovalId)) {
    // Plata entró para una suscripción que ya no tiene ese preapproval como
    // vigente (típicamente: baja voluntaria previa). No reactivamos ni
    // mandamos `subscription_renewed` — el webhook igual se marca
    // procesado (no reintenta infinito, `lockWebhook` ya insertó el evento);
    // esto queda para conciliación/refund manual.
    captureMessage(
      'subscription_authorized_payment approved for a preapproval that does not match the tenant current subscription — likely an in-flight payment after a voluntary cancel',
      {
        level: 'warning',
        extra: {
          tenantId,
          mpPaymentId: mpPaymentId ?? null,
          preapprovalId: preapprovalId ?? null,
          currentMpSubscriptionId: sub.mp_subscription_id,
        },
      },
    )
    return { alreadyProcessed: false }
  }

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
    sub.status === 'churned' ||
    sub.status === 'canceled'
  ) {
    await transitionToActiveFromAny(tenantId, paidAt, newPeriodEnd, tx)
    template = 'subscription_renewed'
  } else {
    // active — no transition, solo extiende el período.
    await tx.execute(sql`
      UPDATE tenant_subscriptions
      SET current_period_end = ${newPeriodEnd.toISOString()}::timestamptz,
          last_payment_at = ${paidAt.toISOString()}::timestamptz,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND status = 'active'
    `)
    template = 'subscription_renewed'
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
