import type PgBoss from 'pg-boss'
import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { dispatchPaymentInfo, lockMpEvent } from '@/modules/payments/payment.service'
import { reconcileApprovedPaymentForBooking } from '@/modules/payments/mp-reconcile.service'
import { dispatchEmail } from '@/modules/notifications/notification.service'
import { notifyAdminBookingConfirmed } from '@/modules/notifications/push.service'
import { CRON_WORK_OPTIONS, QUEUE_RECONCILE_PENDING_PAYMENTS } from '../definitions'
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
 *
 * ENS-16 (post-terminal rescue): this loop alone only ever looks at bookings
 * still IN `pending_payment` — a booking that already `expired` (the 6min
 * hold beat both the webhook AND `booking.expiry.ts`'s own MP pre-check) fell
 * out of scope of every safety net and stayed an orphaned confirmed payment
 * forever. A second pass below scans recently `expired` bookings with the
 * same "checkout started, still pending locally" fingerprint and runs them
 * through the identical rescue.
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
        // ENS-15: the webhook path pushes the admin on confirm (mp-webhook.handler.ts);
        // this reconcile path confirmed the SAME kind of event and was silently
        // skipping it.
        // R1-B (barrido de clase): este loop llama dispatchPaymentInfo DIRECTO
        // (no pasa por reconcileApprovedPaymentForBooking, que ya deriva
        // `confirmed` de `won`) — `outcome.result === 'confirmed'` sale para
        // CUALQUIER pago approved, no solo cuando la transición del booking
        // ganó. Si el booking dejó pending_payment por otro camino justo entre
        // el SELECT de este scan y este dispatch, pushear "Nueva reserva" acá
        // sería un falso positivo/duplicado — el email (admin_late_payment en
        // ese caso) sigue saliendo igual, solo el push se gatea.
        if (outcome.won === true) {
          await notifyAdminBookingConfirmed(row.tenantId, row.bookingId)
        }
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

  const rescued = await reconcileExpiredOrphanedPayments()

  return reconciled + rescued
}

/**
 * ENS-16 post-terminal rescue: bookings that already transitioned to
 * `expired` in the last 24h but still carry a `payments` row with a started
 * MP checkout (`mp_preference_id IS NOT NULL AND status='pending'`) — the
 * fingerprint of a webhook that never arrived AND lost the race against
 * `booking.expiry.ts`'s own same-request MP pre-check. Runs the identical
 * rescue as the loop above; `reconcileApprovedPaymentForBooking` shares its
 * `reconcile-<mpPaymentId>` idempotency key with every other caller, so a
 * booking rescued here can't be double-confirmed by a later pass.
 */
async function reconcileExpiredOrphanedPayments(): Promise<number> {
  const sql = getWorkerSql()

  const orphaned = await sql<StuckBooking[]>`
    SELECT
      b.id         AS "bookingId",
      b.tenant_id  AS "tenantId",
      t.mp_access_token AS "mpAccessToken"
    FROM bookings b
    JOIN tenants t ON t.id = b.tenant_id
    JOIN payments p ON p.booking_id = b.id
    WHERE b.status = 'expired'
      AND b.updated_at > NOW() - INTERVAL '24 hours'
      AND p.mp_preference_id IS NOT NULL
      AND p.status = 'pending'
      AND t.mp_access_token IS NOT NULL
    ORDER BY b.updated_at ASC
    LIMIT 100
  `

  if (orphaned.length === 0) return 0

  let rescued = 0
  for (const row of orphaned) {
    try {
      const gateway = resolveTenantGateway(row.tenantId, row.mpAccessToken)
      const result = await reconcileApprovedPaymentForBooking(
        row.bookingId,
        row.tenantId,
        gateway,
        'reconcile-post-terminal',
      )
      // R1-B (rechazo review): antes `result.confirmed` reflejaba solo "el
      // lock de idempotencia estaba fresco", no si la transición realmente
      // ganó — sobre un booking ya `expired` eso siempre es cierto la primera
      // vez que se ve el evento sintético `reconcile-<mpPaymentId>`, así que
      // el push de "Nueva reserva" salía incondicionalmente acá. Ahora
      // `reconcileApprovedPaymentForBooking` deriva `confirmed` exclusivamente
      // de `won` (mp-reconcile.service.ts) — este guard queda igual en el
      // código, pero ya es correcto sin tocar nada más en este archivo.
      if (!result.confirmed) continue

      await Promise.all(result.notificationIds.map((id) => dispatchEmail(id)))
      await notifyAdminBookingConfirmed(row.tenantId, row.bookingId)
      rescued += 1
      track.payment('payment.reconcile.confirmed', {
        bookingId: row.bookingId,
        tenantId: row.tenantId,
      })
    } catch (err) {
      logger.error('failed post-terminal reconcile for booking', {
        module: 'reconcile-pending-payments',
        bookingId: row.bookingId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (rescued > 0) {
    logger.info('rescued orphaned expired bookings via reconcile', {
      module: 'reconcile-pending-payments',
      count: rescued,
    })
  }
  return rescued
}

export async function registerReconcilePendingPaymentsWorker(
  boss: PgBoss,
): Promise<void> {
  await boss.schedule(QUEUE_RECONCILE_PENDING_PAYMENTS, '*/5 * * * *', {})
  await boss.work(QUEUE_RECONCILE_PENDING_PAYMENTS, CRON_WORK_OPTIONS, async () => {
    await reconcilePendingPayments()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RECONCILE_PENDING_PAYMENTS })
}
