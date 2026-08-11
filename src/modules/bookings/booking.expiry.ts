import { getWorkerSql, withTenantContext } from '@/shared/db/client'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'
import { scheduleBookingExpiry } from '@/shared/jobs/schedule-expiry'
import {
  enqueueNotification,
  enqueueTenantOwnerNotification,
  dispatchEmail,
} from '@/modules/notifications/notification.service'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import {
  reconcileApprovedPaymentForBooking,
  ReconcileProcessingError,
} from '@/modules/payments/mp-reconcile.service'
import { notifyAdminBookingConfirmed } from '@/modules/notifications/push.service'
import { track } from '@/shared/observability'
import { expirePendingBooking } from './booking.service'
import { logger } from '@/shared/lib/logger'
import { captureMessage } from '@/lib/sentry'

/**
 * Outcome of evaluating one pending_payment booking against the expiry policy.
 *  - `expired`     → slot freed (race-safe transition won).
 *  - `rescheduled` → still within its window (or a transfer is in_process); a new
 *                    timer was armed, the booking was NOT touched. ALSO returned
 *                    (R1-A) when MP's precheck confirms an `approved` payment
 *                    but the LOCAL processing of that confirmation throws —
 *                    same "don't touch it, try again later" shape, timer
 *                    re-armed for 120s instead of the remaining hold window.
 *  - `confirmed`   → the window had elapsed, but MP already had an `approved`
 *                    payment for this booking (the webhook lost the race
 *                    against the 6min hold — ENS-16). Confirmed instead of
 *                    expired; the admin was pushed just like a webhook confirm.
 *  - `skipped`     → not found, or already left pending_payment.
 */
export type ExpiryAction = 'expired' | 'rescheduled' | 'confirmed' | 'skipped'

type ExpiryState = {
  status: string
  createdAt: Date
  tenantId: string
  playerId: string | null
  date: string
  timeStart: string
  courtName: string
  tenantName: string
  playerFirstName: string | null
  hasInProcess: boolean
  mpAccessToken: string | null
  hasMpCheckout: boolean
}

async function loadExpiryState(bookingId: string): Promise<ExpiryState | null> {
  // Tenant isn't known until this lookup returns it (Fable 5 P0) — the
  // service-role pool is the only one that can see the row under RLS.
  const dbSql = getWorkerSql()
  const rows = await dbSql<
    {
      status: string
      createdAt: Date
      tenantId: string
      playerId: string | null
      date: string
      timeStart: string
      courtName: string
      tenantName: string
      playerFirstName: string | null
      hasInProcess: boolean
      mpAccessToken: string | null
      hasMpCheckout: boolean
    }[]
  >`
    SELECT
      b.status,
      b.created_at AS "createdAt",
      b.tenant_id  AS "tenantId",
      b.player_id  AS "playerId",
      b.date::text AS date,
      b.time_start::text AS "timeStart",
      c.name AS "courtName",
      t.name AS "tenantName",
      p.first_name AS "playerFirstName",
      EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.booking_id = b.id AND pay.status = 'in_process'
      ) AS "hasInProcess",
      t.mp_access_token AS "mpAccessToken",
      EXISTS (
        SELECT 1 FROM payments pay2
        WHERE pay2.booking_id = b.id
          AND pay2.mp_preference_id IS NOT NULL
          AND pay2.status = 'pending'
      ) AS "hasMpCheckout"
    FROM bookings b
    JOIN courts  c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `
  return rows[0] ?? null
}

function fmtDate(date: string): string {
  return date.slice(0, 10).split('-').reverse().join('/')
}

/**
 * R1-A: cuánto esperar antes de reintentar el precheck cuando MP ya dijo
 * approved pero el procesamiento LOCAL de esa confirmación tiró (DB caída,
 * recordDepositCashFlow, etc.). Corto a propósito — no es una espera de "MP
 * tarda en confirmar" (eso ya pasó), es una espera de "reintentemos el
 * procesamiento local".
 */
const RECONCILE_PROCESS_RETRY_SECONDS = 120

/**
 * R4 (ensayo general, hallazgo 🟡): si `ReconcileProcessingError` es
 * determinístico (no un blip transitorio de DB), el retry de 120s de arriba
 * loopea PARA SIEMPRE — `logger.error` solo escribe a stderr (no llega a
 * Sentry) y el job pg-boss "completa" normalmente en cada corrida, así que
 * el DLQ nunca lo agarra. El principio de no expirar un booking con pago
 * `approved` es inamovible (se mantiene tal cual); lo único que cambia es
 * que, pasado este umbral, CADA retry además manda un `captureMessage` a
 * Sentry para que un humano lo mire. Mismo mensaje en cada llamada = Sentry
 * agrupa las ocurrencias solo; no hace falta dedupe manual acá.
 */
const RECONCILE_PROCESS_ALERT_AFTER_MS = 60 * 60 * 1000

/**
 * Evaluate a single pending_payment booking and expire it when its 6 min window
 * has elapsed (Hallazgo 1). While still inside the window the job is re-armed and
 * the booking is left untouched.
 */
export async function expirePendingBookingWithPolicy(bookingId: string): Promise<ExpiryAction> {
  const state = await loadExpiryState(bookingId)
  if (!state || state.status !== 'pending_payment') return 'skipped'

  const cutoffSeconds = DEFAULT_EXPIRY_SECONDS
  const elapsedSeconds = (Date.now() - new Date(state.createdAt).getTime()) / 1000

  if (elapsedSeconds < cutoffSeconds) {
    // Not due yet — the timer fired early. Re-arm for the remaining time; do NOT expire.
    await scheduleBookingExpiry(bookingId, cutoffSeconds - elapsedSeconds)
    return 'rescheduled'
  }

  // ENS-16: the hold window elapsed, but if the player already paid and MP's
  // webhook just hasn't arrived yet, expiring anyway loses the booking FOREVER
  // — the periodic reconcile worker only scans `pending_payment` bookings, so
  // once this expires there was no rescue. Ask MP directly before giving up.
  // Only worth asking when a checkout was actually started (preference +
  // tenant token); otherwise this is a no-show-at-checkout, not a lost webhook.
  if (state.hasMpCheckout && state.mpAccessToken) {
    try {
      const gateway = resolveTenantGateway(state.tenantId, state.mpAccessToken)
      const result = await reconcileApprovedPaymentForBooking(
        bookingId,
        state.tenantId,
        gateway,
        'expiry-precheck',
      )
      if (result.confirmed) {
        await Promise.all(result.notificationIds.map((id) => dispatchEmail(id)))
        await notifyAdminBookingConfirmed(state.tenantId, bookingId)
        track.payment('payment.reconcile.confirmed', {
          bookingId,
          tenantId: state.tenantId,
        })
        return 'confirmed'
      }
    } catch (err) {
      // R1-A (rechazo review): el catch original trataba TODO error igual —
      // si MP respondió "approved" pero el procesamiento LOCAL después falló
      // (DB, recordDepositCashFlow, etc.), esto se confundía con "MP no
      // contestó" y caía al flujo de expiración de más abajo, expirando una
      // reserva YA PAGADA. reconcileApprovedPaymentForBooking distingue las
      // dos fases: un ReconcileProcessingError SOLO puede salir de la fase
      // PROCESS (post-search), es decir CON el pago ya confirmado por MP —
      // acá JAMÁS se puede expirar. Se re-arma el timer en 120s y se reintenta
      // el procesamiento local, sin tocar el booking.
      if (err instanceof ReconcileProcessingError) {
        const alertMessage =
          'expiry precheck: MP approved pero el procesamiento local falló — reintento en 120s'
        const errorMessage = err.cause instanceof Error ? err.cause.message : String(err.cause)
        logger.error(alertMessage, {
          module: 'booking-expiry',
          bookingId,
          error: errorMessage,
        })
        // "Lleva reintentando" se mide contra el instante en que el booking
        // DEBIÓ expirar (createdAt + la ventana de hold), no contra
        // `createdAt` a secas — ese es el arranque real de este loop de
        // retry: antes de esa marca, el precheck ni se ejecuta (la rama de
        // arriba corta con 'rescheduled' sin tocar MP). `state.createdAt` es
        // el único campo temporal que ya trae `loadExpiryState`.
        const dueAtMs = new Date(state.createdAt).getTime() + cutoffSeconds * 1000
        const elapsedMs = Date.now() - dueAtMs
        if (elapsedMs > RECONCILE_PROCESS_ALERT_AFTER_MS) {
          captureMessage(alertMessage, {
            level: 'error',
            extra: {
              bookingId,
              tenantId: state.tenantId,
              mpPaymentId: undefined,
              elapsedMs,
              error: errorMessage,
            },
          })
        }
        await scheduleBookingExpiry(bookingId, RECONCILE_PROCESS_RETRY_SECONDS)
        return 'rescheduled'
      }
      // Fase SEARCH falló (MP unreachable/erroring) — no sabemos si pagó, no
      // bloquear la expiración por eso. Si el pago realmente está approved, la
      // red de rescate post-terminal del worker de reconcile lo rescata de
      // `expired` dentro de las próximas 24h.
      logger.error('expiry precheck against MP failed', {
        module: 'booking-expiry',
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const dateFmt = fmtDate(state.date)
  const timeStartFmt = state.timeStart.slice(0, 5)
  const notifIds: string[] = []

  // Tenant is known now (from loadExpiryState) — mutate through the
  // regular, RLS-scoped pool instead of the service-role one (Fable 5 P0).
  const won = await withTenantContext(state.tenantId, async (tx) => {
    const result = await expirePendingBooking(bookingId, tx)
    if (!result.won) return false

    if (state.playerId) {
      const id = await enqueueNotification(
        {
          tenantId: state.tenantId,
          recipientType: 'player',
          recipientId: state.playerId,
          templateName: 'deposit_expired',
          content: {
            playerFirstName: state.playerFirstName ?? '',
            courtName: state.courtName,
            date: dateFmt,
            timeStart: timeStartFmt,
            tenantName: state.tenantName,
          },
          triggerEvent: 'booking.expired',
        },
        tx,
      )
      notifIds.push(id)
    }

    if (state.hasInProcess) {
      // 48h transfer never settled — alert the admin (slot was freed).
      const adminIds = await enqueueTenantOwnerNotification(
        {
          tenantId: state.tenantId,
          templateName: 'admin_transfer_expired',
          content: {
            courtName: state.courtName,
            date: dateFmt,
            timeStart: timeStartFmt,
            bookingId,
          },
          triggerEvent: 'booking.transfer_expired',
        },
        tx,
      )
      notifIds.push(...adminIds)
    }

    return true
  })

  if (!won) return 'skipped'

  await Promise.all(notifIds.map((id) => dispatchEmail(id)))
  return 'expired'
}

/**
 * Safety net (Hallazgo 1): sweep every pending_payment booking past its 6 min
 * window in case the per-booking pg-boss job never ran. Each one goes through the
 * same race-safe policy, so overlap with a live job is harmless.
 */
export async function sweepExpiredPendingBookings(): Promise<number> {
  // Cross-tenant scan (Fable 5 P0) — same service-role pool as loadExpiryState.
  const dbSql = getWorkerSql()
  const rows = await dbSql<{ id: string }[]>`
    SELECT b.id
    FROM bookings b
    WHERE b.status = 'pending_payment'
      AND b.created_at < NOW() - (${DEFAULT_EXPIRY_SECONDS} * INTERVAL '1 second')
    ORDER BY b.created_at ASC
    LIMIT 500
  `

  let expired = 0
  for (const row of rows) {
    const action = await expirePendingBookingWithPolicy(row.id)
    if (action === 'expired') expired += 1
  }
  if (expired > 0) {
    logger.info('sweep expired bookings', {
      module: 'expire-pending-booking-sweep',
      count: expired,
    })
  }
  return expired
}
