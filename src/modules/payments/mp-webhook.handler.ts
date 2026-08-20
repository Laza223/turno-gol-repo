import { eq, sql } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from './mp-oauth'
import type { PaymentGateway } from './mp-gateway'
import { dispatchPaymentInfo, lockMpEvent } from './payment.service'
import { TenantMpNotConnectedError } from './payment.errors'
import { parseSaasUpgradeRef, type GatewayPaymentInfo } from './payment.types'
import { onPaymentApproved, onPaymentRejected } from '@/modules/billing/dunning.service'
import { handleUpgradeApproved } from '@/modules/billing/billing.service'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { notifyAdminBookingConfirmed } from '@/modules/notifications/push.service'
import { track } from '@/shared/observability'

/**
 * Payload for the `process-mp-webhook` queue. The route enqueues this; the
 * worker passes it straight to `handleMpWebhookJob`.
 */
export type MpWebhookJob = {
  tenantId: string
  mpEventId: string
  eventType: string
  mpPaymentId: string
  rawPayload: unknown
  /**
   * `'saas'` cuando el pago pertenece a la cuenta MASTER de TurnoGol
   * (suscripción o proraeo de upgrade) en vez de al MP del complejo. Viene del
   * `&source=saas` que TurnoGol mismo pone en la `notification_url`
   * (billing.service). Opcional: los webhooks de seña no lo traen.
   */
  source?: 'saas'
}

/**
 * Unit of work for the pg-boss `process-mp-webhook` queue.
 *
 *   1. Resolve tenant + decrypt MP access token (per-tenant OAuth, ADR-004).
 *   2. Fase SEARCH: `gateway.getPaymentStatus` (F2, hallazgo D4-A1 — clase
 *      Saga) se resuelve ACÁ, fuera de cualquier tx — mismo patrón que
 *      `mp-reconcile.service.ts`. `subscription_preapproval` no la necesita.
 *   3. Fase PROCESS: abre un tx tenant-scoped, solo DB, y dispatch por
 *      event type:
 *      - `subscription_authorized_payment` → dunning.onPaymentApproved/Rejected
 *      - `subscription_preapproval`        → no-op (we cancel/update via API, MP echoes)
 *      - `payment`                          → SaaS-upgrade dispatch OR booking deposit
 *
 * Throws on tenant-not-connected or downstream errors; pg-boss retries up to
 * 5 times with backoff (see `MP_WEBHOOK_SEND_OPTIONS`).
 */
export async function handleMpWebhookJob(job: MpWebhookJob): Promise<void> {
  const db = getDb()
  const rows = await db
    .select({
      id: tenants.id,
      mpAccessToken: tenants.mpAccessToken,
    })
    .from(tenants)
    .where(eq(tenants.id, job.tenantId))
    .limit(1)

  const tenant = rows[0]

  // Pre-check read-only, FUERA de tx: una entrega repetida (re-post de MP o
  // retry de pg-boss tras un fallo post-commit) corta acá sin repagar el GET
  // a MP de la fase SEARCH. Best-effort con TOCTOU benigno: si dice "no
  // existe" y otro worker gana la carrera, el lock transaccional de la fase
  // PROCESS (lockMpEvent/lockWebhook) sigue siendo la idempotencia real; si
  // dice "existe" es definitivo (processed_webhooks solo purga >30d).
  const seen = await db.execute(sql`
    SELECT 1 FROM processed_webhooks WHERE mp_event_id = ${job.mpEventId} LIMIT 1
  `)
  if ((seen as unknown as unknown[]).length > 0) {
    track.webhook('mp.webhook.processed', {
      mpEventId: job.mpEventId,
      tenantId: job.tenantId,
      eventType: job.eventType,
      mpPaymentId: job.mpPaymentId,
    })
    return
  }

  // Subscription events (recurring charge, preapproval echo) are billed
  // through TurnoGol's MASTER MP account (billing.gateway), never the
  // tenant's booking-deposit OAuth token — a tenant that never connected MP
  // for señas can still have an active SaaS subscription. Only the `payment`
  // branch (booking deposit / SaaS upgrade proration) needs the tenant token.
  const isSubscriptionEvent =
    job.eventType === 'subscription_authorized_payment' ||
    job.eventType === 'subscription_preapproval'

  // TG-P1-MP-02: el proraeo de un upgrade llega como `payment` — mismo tipo que
  // una seña — pero su preferencia la creó la cuenta MASTER
  // (`createSaasUpgradePreference` vía `getBillingGateway`). Sin este `source`,
  // caía en el `else` y se consultaba con el token OAuth del complejo: MP no
  // encuentra un pago de otra cuenta, el job falla y el upgrade nunca se aplica
  // pese a estar cobrado. Peor todavía, un complejo que nunca conectó MP para
  // señas ni siquiera llegaba hasta ahí — moría en el throw de abajo. Era el
  // motivo por el que `/api/billing/upgrade` estaba gateado en 501.
  const isMasterAccountEvent = isSubscriptionEvent || job.source === 'saas'

  let gateway: PaymentGateway
  if (isMasterAccountEvent) {
    gateway = getBillingGateway()
  } else {
    if (!tenant?.mpAccessToken) {
      throw new TenantMpNotConnectedError(job.tenantId)
    }
    // Wired with the 401 refresh-and-retry fail-safe (Hallazgo 4): if the
    // per-tenant access token expired between cron refreshes, the gateway
    // refreshes it on the fly and retries the failing call.
    gateway = resolveTenantGateway(job.tenantId, tenant.mpAccessToken)
  }

  // Fase SEARCH (F2, hallazgo D4-A1 — clase Saga): el fetch a MP se resuelve
  // ACÁ, fuera de cualquier tx — mismo patrón que `mp-reconcile.service.ts`.
  // Antes vivía DENTRO de `withTenantContext` y dejaba la conexión del pool
  // `turnogol_app` idle-in-transaction durante el round trip HTTP (timeout
  // 8s; hasta ~24s si dispara refresh de token OAuth vía `onUnauthorized`,
  // ver mp-oauth.ts). `subscription_preapproval` es el único evento que no
  // necesita el pago (eco de MP que se registra idempotentemente sin llamar
  // a MP). Las entregas repetidas ya cortaron en el pre-check de arriba sin
  // llegar acá; una carrera exacta puede pagar el fetch doble, y el lock
  // transaccional de la fase PROCESS decide.
  //
  // El cobro de suscripción NO se pide a `/v1/payments`: su `data.id` es la
  // factura del mes (`authorized_payment`), que ahí no existe — verificado en
  // producción el 2026-08-20, `GET /v1/payments/7031112147` devuelve 404 y el
  // pago real es otro id, anidado adentro de la factura. Con `getPaymentStatus`
  // este camino fallaba en cada reintento con la plata ya cobrada.
  const info: GatewayPaymentInfo | null =
    job.eventType === 'subscription_preapproval'
      ? null
      : job.eventType === 'subscription_authorized_payment'
        ? await gateway.getSubscriptionChargeInfo(job.mpPaymentId)
        : await gateway.getPaymentStatus(job.mpPaymentId)

  // Capture the booking id when a deposit is confirmed, so we can enqueue a
  // push notification AFTER the transaction commits. This avoids threading
  // bookingId through WebhookOutcome's type (minimal change, same pattern
  // as how dispatchEmail fires post-commit).
  let confirmedBookingId: string | null = null

  // Fase PROCESS: tx tenant-scoped, solo DB — usa el `info` ya resuelto
  // arriba, nunca vuelve a llamar a MP.
  const outcome = await withTenantContext(job.tenantId, async (tx) => {
    if (job.eventType === 'subscription_authorized_payment') {
      // `info` siempre está resuelto acá: el mismo `job.eventType` decidió
      // el fetch de la fase SEARCH de arriba.
      if (!info) {
        throw new Error(
          'mp-webhook: missing prefetched payment info for subscription_authorized_payment',
        )
      }
      // Cross-check: `createPreapproval` sets external_reference = tenantId
      // (payment.types.ts). A holder of MP_WEBHOOK_SECRET must not be able
      // to apply another tenant's recurring-charge outcome by claiming a
      // different `?tenant=` query param on the webhook URL.
      if (info.externalReference !== job.tenantId) {
        throw new Error(
          `webhook tenant mismatch: claimed=${job.tenantId} actual=${info.externalReference}`,
        )
      }
      const at = new Date()
      if (info.status === 'approved') {
        // Fix 2b (billing R2 🔴): `info.mpPaymentId`/`info.preapprovalId`
        // vienen de `gateway.getPaymentStatus` (real: point_of_interaction.
        // linked_to — mp-gateway.implementation.ts) y le permiten a
        // `onPaymentApproved` verificar que este pago es del preapproval
        // VIGENTE de la suscripción antes de reactivarla.
        await onPaymentApproved(
          job.tenantId,
          job.mpEventId,
          job.eventType,
          job.rawPayload,
          at,
          tx,
          info.mpPaymentId,
          info.preapprovalId,
        )
      } else if (info.status === 'rejected' || info.status === 'cancelled') {
        await onPaymentRejected(job.tenantId, job.mpEventId, job.eventType, job.rawPayload, at, tx)
      }
      // pending / in_process: no-op until next event.
      return
    }

    if (job.eventType === 'subscription_preapproval') {
      // Preapproval lifecycle echoes (cancel/hold) — we drive these via API
      // calls in billing.service. Just record idempotently and return.
      return
    }

    // type === 'payment' — booking deposit OR SaaS upgrade proration.
    // El lock sigue yendo primero: ya no evita pagar `getPaymentStatus` (la
    // fase SEARCH de arriba ya lo hizo, sin importar si esto termina siendo
    // una entrega duplicada) — sigue siendo la idempotencia real, atómica
    // con el resto de esta tx: una entrega repetida corta acá, antes de
    // tocar una sola fila.
    const event = {
      mpEventId: job.mpEventId,
      eventType: job.eventType,
      mpPaymentId: job.mpPaymentId,
      rawPayload: job.rawPayload,
    }
    const fresh = await lockMpEvent(event, tx)
    if (!fresh) return

    // `info` siempre está resuelto acá (ver fase SEARCH de arriba).
    if (!info) {
      throw new Error('mp-webhook: missing prefetched payment info for payment event')
    }
    const upgrade = parseSaasUpgradeRef(info.externalReference)

    // El `source=saas` de la URL y el `external_reference` del pago tienen que
    // contar la misma historia. No alcanza con confiar en la query: quien tenga
    // el secreto del webhook podría mandar `source=saas` sobre una seña y
    // hacerla resolver contra la cuenta master. Si no coinciden, se corta —
    // pg-boss reintenta y el evento queda visible en vez de aplicar plata por
    // la rama equivocada.
    if ((job.source === 'saas') !== Boolean(upgrade)) {
      throw new Error(
        `webhook source mismatch: source=${job.source ?? 'none'} ref=${info.externalReference}`,
      )
    }

    if (upgrade) {
      // Cross-check: the webhook's claimed tenant (?tenant= query) MUST match the
      // tenant embedded in the payment's external_reference. A holder of
      // MP_WEBHOOK_SECRET could otherwise enqueue a job for an arbitrary tenant.
      if (upgrade.tenantId !== job.tenantId) {
        throw new Error(
          `webhook tenant mismatch: claimed=${job.tenantId} actual=${upgrade.tenantId}`,
        )
      }
      if (info.status === 'approved') {
        await handleUpgradeApproved(
          upgrade.tenantId,
          upgrade.targetPlanId,
          gateway,
          tx,
          job.mpPaymentId,
        )
      }
      return
    }

    // Booking deposit — external_reference is the booking id. Confirm the
    // booking belongs to the claimed tenant before any side effect.
    const bookingRow = await tx.execute(sql`
      SELECT tenant_id FROM bookings WHERE id = ${info.externalReference} LIMIT 1
    `)
    const claimed = (bookingRow as unknown as Array<{ tenant_id: string }>)[0]?.tenant_id
    if (!claimed) return // not found / RLS-filtered: nothing to do for this tenant.
    if (claimed !== job.tenantId) {
      throw new Error(`webhook tenant mismatch: claimed=${job.tenantId} actual=${claimed}`)
    }

    const depositOutcome = await dispatchPaymentInfo(info, job.tenantId, tx)
    // Capture bookingId only when the booking transition actually succeeded
    // (won). R1-B (barrido de clase, rechazo review): `result === 'confirmed'`
    // NO significa `won` — dispatchPaymentInfo lo devuelve para CUALQUIER pago
    // approved, incluso el guard perdedor de transitionFromPendingPayment
    // sobre un booking ya post-terminal (webhook que llega tarde, después de
    // que booking.expiry.ts ya lo expiró). Ese caso ya dispara el email
    // admin_late_payment correcto (notificationIds más abajo); pushear
    // "Nueva reserva" además sería un falso positivo.
    if (depositOutcome && !depositOutcome.alreadyProcessed && depositOutcome.won === true) {
      confirmedBookingId = info.externalReference
    }
    return depositOutcome
  })

  // Dispatch any notifications enqueued inside the tx (e.g. late-payment admin
  // alert, Hallazgo 3) only after it has committed — the rows must exist when
  // the send-email worker reads them.
  if (outcome && !outcome.alreadyProcessed) {
    await Promise.all((outcome.notificationIds ?? []).map((id) => dispatchEmail(id)))
  }

  // Push notification to admin when a booking deposit is confirmed.
  // Fired AFTER the tx commits — notifyAdminBookingConfirmed re-fetches the
  // booking context in its own short tenant-scoped tx and never throws (a
  // push failure must never fail the payment confirmation).
  if (confirmedBookingId) {
    await notifyAdminBookingConfirmed(job.tenantId, confirmedBookingId)
  }

  track.webhook('mp.webhook.processed', {
    mpEventId: job.mpEventId,
    tenantId: job.tenantId,
    eventType: job.eventType,
    mpPaymentId: job.mpPaymentId,
  })
}
