import type PgBoss from 'pg-boss'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { dispatchPaymentInfo, lockMpEvent } from '@/modules/payments/payment.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { QUEUE_RECONCILE_PENDING_PAYMENTS } from '../definitions'
import { track } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'

type StuckBooking = {
  bookingId: string
  tenantId: string
  mpAccessToken: string
}

/**
 * Safety polling (Fase 6 §6.6): every 5 minutes, find bookings stuck in
 * `pending_payment` that initiated MP checkout (have a payments row with
 * mp_preference_id) but never received a webhook confirmation.
 *
 * For each, poll MP's Payment Search API by external_reference (= bookingId).
 * If an approved payment exists on MP's side, process it through the standard
 * dispatchPaymentInfo flow — the booking gets confirmed instead of expiring.
 */
export async function reconcilePendingPayments(): Promise<number> {
  // Cross-tenant scan (Fable 5 P0): needs the service-role pool, otherwise a
  // restricted app role sees 0 stuck bookings under RLS. The per-row mutation
  // below already opens its own tenant-scoped tx via `withTenantContext`.
  const sql = getWorkerSql()

  const stuck = await sql<StuckBooking[]>`
    SELECT
      b.id         AS "bookingId",
      b.tenant_id  AS "tenantId",
      t.mp_access_token AS "mpAccessToken"
    FROM bookings b
    JOIN tenants t ON t.id = b.tenant_id
    JOIN payments p ON p.booking_id = b.id
    WHERE b.status = 'pending_payment'
      AND p.mp_preference_id IS NOT NULL
      AND p.status = 'pending'
      AND b.created_at < NOW() - INTERVAL '5 minutes'
      AND t.mp_access_token IS NOT NULL
    ORDER BY b.created_at ASC
    LIMIT 100
  `

  if (stuck.length === 0) return 0

  let reconciled = 0
  for (const row of stuck) {
    try {
      const gateway = resolveTenantGateway(row.tenantId, row.mpAccessToken)
      const mpPayments = await gateway.searchPaymentsByReference(row.bookingId)

      const approved = mpPayments.find((p) => p.status === 'approved')
      if (!approved) continue

      const outcome = await withTenantContext(row.tenantId, async (tx) => {
        const event = {
          mpEventId: `reconcile-${approved.mpPaymentId}`,
          eventType: 'payment',
          mpPaymentId: approved.mpPaymentId,
          rawPayload: { source: 'safety-polling', bookingId: row.bookingId },
        }
        const fresh = await lockMpEvent(event, tx)
        if (!fresh) return null
        return dispatchPaymentInfo(approved, row.tenantId, tx)
      })

      if (outcome && !outcome.alreadyProcessed) {
        await Promise.all((outcome.notificationIds ?? []).map((id) => dispatchEmail(id)))
        reconciled += 1
        track.payment('payment.reconcile.confirmed', {
          bookingId: row.bookingId,
          tenantId: row.tenantId,
          mpPaymentId: approved.mpPaymentId,
        })
      }
    } catch (err) {
      logger.error('failed reconcile for booking', { module: 'reconcile-pending-payments', bookingId: row.bookingId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (reconciled > 0) {
    logger.info('confirmed bookings via reconcile', { module: 'reconcile-pending-payments', count: reconciled })
  }
  return reconciled
}

export async function registerReconcilePendingPaymentsWorker(
  boss: PgBoss,
): Promise<void> {
  await boss.schedule(QUEUE_RECONCILE_PENDING_PAYMENTS, '*/5 * * * *', {})
  await boss.work(QUEUE_RECONCILE_PENDING_PAYMENTS, async () => {
    await reconcilePendingPayments()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RECONCILE_PENDING_PAYMENTS })
}
