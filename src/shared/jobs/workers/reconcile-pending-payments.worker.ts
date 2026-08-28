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
import { captureException } from '@/lib/sentry'

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
 * ENS-16: this loop alone only ever looks at bookings still IN
 * `pending_payment` — a booking that already `expired` (the 6min hold beat
 * both the webhook AND `booking.expiry.ts`'s own MP pre-check) fell out of
 * scope of every safety net and stayed an orphaned paid booking forever. A
 * second pass below scans recently `expired` bookings with the same "checkout
 * started, still pending locally" fingerprint.
 *
 * OJO con el nombre viejo: ese segundo pase se escribió como "post-terminal
 * RESCUE", pero nunca pudo resucitar nada y no era un bug de este archivo —
 * `expired` es terminal en las tres capas (state machine, el guard
 * `WHERE status='pending_payment'` de transitionFromPendingPayment, y el
 * trigger enforce_booking_invariants_fn), a propósito. Desde la decisión del
 * dueño del 2026-08-19 el segundo pase hace lo que sí corresponde: pedirle la
 * devolución a MP y avisarle al jugador y al complejo. Ver
 * docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md.
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
    JOIN payments p ON p.id = b.payment_id
    WHERE b.status = 'pending_payment'
      AND p.mp_preference_id IS NOT NULL
      AND p.status = 'pending'
      AND b.created_at < NOW() - INTERVAL '5 minutes'
      AND t.mp_access_token IS NOT NULL
    ORDER BY b.created_at ASC
    LIMIT 100
  `

  let reconciled = 0
  let refunded = 0
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

      if (outcome && !outcome.alreadyProcessed && outcome.preparedRefund) {
        // El booking salió de pending_payment entre el SELECT de este scan y
        // este dispatch (lo expiró el job por-booking) y MP ya había aprobado:
        // pago tardío. La devolución quedó registrada con la tx de arriba y la
        // hace el complejo; acá solo se cuenta para el resumen de la corrida.
        refunded += 1
      }

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
      // Sentry ADEMÁS del log: este catch se come el único aviso de que hay un
      // pago aprobado sin reserva. Con `logger.error` a secas queda en el
      // stderr de Railway, que nadie mira — que es exactamente cómo esto
      // sobrevivió 5 horas sin que se notara (2026-08-18).
      logger.error('failed reconcile for booking', {
        module: 'reconcile-pending-payments',
        bookingId: row.bookingId,
        error: err instanceof Error ? err.message : String(err),
      })
      captureException(err, {
        extra: { bookingId: row.bookingId, tenantId: row.tenantId, pass: 'pending_payment' },
      })
    }
  }

  if (reconciled > 0 || refunded > 0) {
    logger.info('confirmed bookings via reconcile', {
      module: 'reconcile-pending-payments',
      count: reconciled,
      refunded,
    })
  }

  const rescued = await reconcileExpiredOrphanedPayments()

  return reconciled + rescued
}

/**
 * Pago tardío (ENS-16 + decisión del dueño 2026-08-19): bookings que ya
 * pasaron a `expired` en las últimas 24h pero siguen con una fila de
 * `payments` con checkout arrancado (`mp_preference_id IS NOT NULL AND
 * status='pending'`) — la huella de un webhook que nunca llegó Y que además le
 * ganó al pre-check de MP de `booking.expiry.ts`.
 *
 * El turno NO se resucita (`expired` es terminal por diseño en las tres capas):
 * si MP tiene el pago aprobado, `handleApproved` pide la devolución y le avisa
 * al jugador y al complejo. Devuelve la cantidad de pagos tardíos resueltos.
 *
 * Idempotencia: la clave de evento `reconcile-<mpPaymentId>` que comparte con
 * el pre-check de expiración NO alcanza —al mismo pago se llega también por el
 * webhook real, con otra clave—, así que la barrera contra el doble reembolso
 * NO vive acá sino en `prepareLatePaymentRefund` (payment.service.ts), que
 * pregunta por el PAGO ORIGINAL y por lo tanto cubre los cuatro caminos.
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

      // Pago tardío: MP tenía el pago, el turno ya no existe, la plata volvió.
      // `reconcileApprovedPaymentForBooking` ya liquidó el reembolso contra MP
      // y dejó encolados los dos mails (jugador y complejo); acá solo se
      // despachan y se cuenta.
      if (result.refunded) {
        await Promise.all(result.notificationIds.map((id) => dispatchEmail(id)))
        rescued += 1
        track.payment('payment.reconcile.late_refunded', {
          bookingId: row.bookingId,
          tenantId: row.tenantId,
        })
        continue
      }
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
      // Ver el catch del pase 1: sin Sentry esto es un log que nadie lee.
      logger.error('failed post-terminal reconcile for booking', {
        module: 'reconcile-pending-payments',
        bookingId: row.bookingId,
        error: err instanceof Error ? err.message : String(err),
      })
      captureException(err, {
        extra: { bookingId: row.bookingId, tenantId: row.tenantId, pass: 'expired' },
      })
    }
  }

  if (rescued > 0) {
    logger.info('late payments refunded on expired bookings', {
      module: 'reconcile-pending-payments',
      count: rescued,
    })
  }
  return rescued
}

export async function registerReconcilePendingPaymentsWorker(boss: PgBoss): Promise<void> {
  await boss.schedule(QUEUE_RECONCILE_PENDING_PAYMENTS, '*/5 * * * *', {})
  await boss.work(QUEUE_RECONCILE_PENDING_PAYMENTS, CRON_WORK_OPTIONS, async () => {
    await reconcilePendingPayments()
  })
  logger.info('registered queue', { module: 'workers', queue: QUEUE_RECONCILE_PENDING_PAYMENTS })
}
