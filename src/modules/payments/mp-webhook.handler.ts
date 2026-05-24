import { eq, sql } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from './mp-oauth'
import { dispatchPaymentInfo, lockMpEvent } from './payment.service'
import { TenantMpNotConnectedError } from './payment.errors'
import { parseSaasUpgradeRef } from './payment.types'
import {
  onPaymentApproved,
  onPaymentRejected,
} from '@/modules/billing/dunning.service'
import { handleUpgradeApproved } from '@/modules/billing/billing.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
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
}

/**
 * Unit of work for the pg-boss `process-mp-webhook` queue.
 *
 *   1. Resolve tenant + decrypt MP access token (per-tenant OAuth, ADR-004).
 *   2. Open a tenant-scoped tx and dispatch by event type:
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
  if (!tenant?.mpAccessToken) {
    throw new TenantMpNotConnectedError(job.tenantId)
  }

  // Wired with the 401 refresh-and-retry fail-safe (Hallazgo 4): if the
  // per-tenant access token expired between cron refreshes, the gateway
  // refreshes it on the fly and retries the failing call.
  const gateway = resolveTenantGateway(job.tenantId, tenant.mpAccessToken)

  const outcome = await withTenantContext(job.tenantId, async (tx) => {
    if (job.eventType === 'subscription_authorized_payment') {
      const info = await gateway.getPaymentStatus(job.mpPaymentId)
      const at = new Date()
      if (info.status === 'approved') {
        await onPaymentApproved(
          job.tenantId,
          job.mpEventId,
          job.eventType,
          job.rawPayload,
          at,
          tx,
        )
      } else if (info.status === 'rejected' || info.status === 'cancelled') {
        await onPaymentRejected(
          job.tenantId,
          job.mpEventId,
          job.eventType,
          job.rawPayload,
          at,
          tx,
        )
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
    // Lock first so duplicate webhook deliveries don't pay for getPaymentStatus.
    const event = {
      mpEventId: job.mpEventId,
      eventType: job.eventType,
      mpPaymentId: job.mpPaymentId,
      rawPayload: job.rawPayload,
    }
    const fresh = await lockMpEvent(event, tx)
    if (!fresh) return

    const info = await gateway.getPaymentStatus(job.mpPaymentId)
    const upgrade = parseSaasUpgradeRef(info.externalReference)
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
      throw new Error(
        `webhook tenant mismatch: claimed=${job.tenantId} actual=${claimed}`,
      )
    }

    return dispatchPaymentInfo(info, job.tenantId, tx)
  })

  // Dispatch any notifications enqueued inside the tx (e.g. late-payment admin
  // alert, Hallazgo 3) only after it has committed — the rows must exist when
  // the send-email worker reads them.
  if (outcome && !outcome.alreadyProcessed) {
    for (const id of outcome.notificationIds ?? []) {
      await dispatchEmail(id)
    }
  }

  track.webhook('mp.webhook.processed', {
    mpEventId: job.mpEventId,
    tenantId: job.tenantId,
    eventType: job.eventType,
    mpPaymentId: job.mpPaymentId,
  })
}
