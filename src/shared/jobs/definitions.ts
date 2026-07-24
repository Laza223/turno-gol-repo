/**
 * Centralized pg-boss queue names + send options + work (poll) options.
 * Retry config lives on SendOptions (per enqueue), not on WorkOptions (pg-boss v9).
 */

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_SEND_EMAIL = 'send-email'
export const QUEUE_PUSH_SEND = 'push-send'
export const QUEUE_EXPIRE_TRIALS = 'expire-trials'
export const QUEUE_AUTO_COMPLETE = 'auto-complete-bookings'
export const QUEUE_DUNNING_RETRY = 'dunning-retry'
export const QUEUE_DATA_RETENTION = 'data-retention-cleanup'
export const QUEUE_EXPIRE_PENDING_BOOKING = 'expire-pending-booking'
export const QUEUE_EXPIRE_PENDING_BOOKING_SWEEP = 'expire-pending-booking-sweep'
export const QUEUE_REFRESH_MP_TOKENS = 'refresh-mp-tokens'
export const QUEUE_RECONCILE_PENDING_PAYMENTS = 'reconcile-pending-payments'
export const QUEUE_RETRY_PENDING_REFUNDS = 'retry-pending-refunds'
export const QUEUE_HEALTH_PING = 'health-ping'
export const QUEUE_RECONCILE_ACCOUNTING_DRIFT = 'reconcile-accounting-drift'

// ─── Job payload types ────────────────────────────────────────────────────────

export type SendEmailJobData = {
  notification_id: string
}

export type ExpirePendingBookingJobData = {
  bookingId: string
}

// ─── Expiry cutoff ────────────────────────────────────────────────────────────
// 6 min timer for an online deposit before the slot is freed.
export const DEFAULT_EXPIRY_SECONDS = 6 * 60

// ─── Send options (retry config) ──────────────────────────────────────────────

export const SEND_EMAIL_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInHours: 24,
} as const

export const EXPIRE_PENDING_BOOKING_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  // Comfortably outlives the 6 min timer + retries so a rescheduled job isn't dropped.
  expireInHours: 1,
} as const

// ─── Push notifications ───────────────────────────────────────────────────────

export type PushSendJobData = {
  subscription_id: string
  payload: {
    type: string
    bookingId?: string
    courtName?: string
    dateLabel?: string
    timeLabel?: string
    url?: string
    [k: string]: unknown
  }
  // F3 (hallazgo D4): clave determinística de idempotencia. Si viene, el
  // worker reclama la fila en push_send_log (INSERT ... ON CONFLICT DO
  // NOTHING) ANTES de enviar — sin ella el job se comporta como antes
  // (at-least-once, sin guard). Ver push.service.ts / push.worker.ts.
  dedupeKey?: string
}

export const PUSH_SEND_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInHours: 1,
} as const

// ─── Poll tuning (WorkOptions) ─────────────────────────────────────────────────
// D5 (auditoría de datos, 2026-07-23): en prod, el poller de pg-boss
// (`WITH nextJob as (SELECT id FROM pgboss.job ...)`) resultó la TOP query
// absoluta de la DB con la app sin tráfico — cada `boss.work()` sondea cada
// `newJobCheckInterval` (default v9 = 2000ms, ver
// node_modules/pg-boss/src/attorney.js `applyNewJobCheckInterval`). Las colas
// que solo dispara `boss.schedule` (cron) no necesitan esa latencia: la
// más frecuente corre cada 5 minutos, así que 30s de polling no le agrega
// demora perceptible al primer job pero corta el volumen de sondeos ~15x.
// Aplicar SOLO a colas cron — las latency-sensitive (webhooks de MP, push,
// email, expiración directa de reservas por-booking) quedan en el default.
export const CRON_WORK_OPTIONS = {
  newJobCheckIntervalSeconds: 30,
} as const
