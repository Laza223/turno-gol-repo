import { eq, sql } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb, getSql, withTenantContext } from '@/shared/db/client'
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
import { notifyAdminPush } from '@/modules/notifications/push.service'
import { track } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'

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

  // Capture the booking id when a deposit is confirmed, so we can enqueue a
  // push notification AFTER the transaction commits. This avoids threading
  // bookingId through WebhookOutcome's type (minimal change, same pattern
  // as how dispatchEmail fires post-commit).
  let confirmedBookingId: string | null = null

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

    const depositOutcome = await dispatchPaymentInfo(info, job.tenantId, tx)
    // Capture bookingId only when the booking transition actually succeeded (won).
    // dispatchPaymentInfo returns result='confirmed' for the approved+won path.
    if (
      depositOutcome &&
      !depositOutcome.alreadyProcessed &&
      depositOutcome.result === 'confirmed'
    ) {
      confirmedBookingId = info.externalReference
    }
    return depositOutcome
  })

  // Dispatch any notifications enqueued inside the tx (e.g. late-payment admin
  // alert, Hallazgo 3) only after it has committed — the rows must exist when
  // the send-email worker reads them.
  if (outcome && !outcome.alreadyProcessed) {
    for (const id of outcome.notificationIds ?? []) {
      await dispatchEmail(id)
    }
  }

  // Push notification to admin when a booking deposit is confirmed.
  // Fired AFTER the tx commits; wrapped in try/catch so a push failure never
  // rolls back or fails the payment confirmation.
  if (confirmedBookingId) {
    const bookingId = confirmedBookingId
    try {
      // Re-fetch booking context post-commit (no shared scope with withTenantContext above).
      // Service-role getSql() bypasses RLS — booking already exists + committed.
      const notifSql = getSql()
      const bookingCtxRows = await notifSql<{
        court_name: string
        date: string
        time_start: string
        time_end: string
      }[]>`
        SELECT c.name AS court_name,
               b.date::text AS date,
               b.time_start AS time_start,
               b.time_end AS time_end
        FROM bookings b
        JOIN courts c ON c.id = b.court_id
        WHERE b.id = ${bookingId}
        LIMIT 1
      `
      const ctx = bookingCtxRows[0]
      const ymd = ctx?.date?.slice(0, 10) ?? ''
      const dateLabel = ctx?.date
        ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            timeZone: 'America/Argentina/Buenos_Aires',
          })
        : ymd
      const timeStart = ctx?.time_start ?? ''
      const timeEnd = ctx?.time_end ?? ''
      const timeLabel = timeStart && timeEnd ? `${timeStart}–${timeEnd}` : timeStart

      await notifyAdminPush(job.tenantId, {
        type: 'booking.confirmed_online',
        bookingId,
        courtName: ctx?.court_name,
        dateLabel,
        timeLabel,
        url: `/admin/grilla?date=${ymd}&highlight=${bookingId}`,
      })
    } catch (err) {
      logger.error('push dispatch after booking confirmation failed', {
        module: 'mp-webhook',
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  track.webhook('mp.webhook.processed', {
    mpEventId: job.mpEventId,
    tenantId: job.tenantId,
    eventType: job.eventType,
    mpPaymentId: job.mpPaymentId,
  })
}
