/**
 * Centralized pg-boss queue names + send options + work (poll) options.
 * Retry config lives on SendOptions (per enqueue), not on WorkOptions (pg-boss v9).
 */

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_SEND_EMAIL = 'send-email'
export const QUEUE_PUSH_SEND = 'push-send'
export const QUEUE_EXPIRE_TRIALS = 'expire-trials'
export const QUEUE_AUTO_COMPLETE = 'auto-complete-bookings'
export const QUEUE_AUTO_CREDIT_UNPAID = 'auto-credit-unpaid'
export const QUEUE_DUNNING_RETRY = 'dunning-retry'
export const QUEUE_DATA_RETENTION = 'data-retention-cleanup'
export const QUEUE_EXPIRE_PENDING_BOOKING = 'expire-pending-booking'
export const QUEUE_EXPIRE_PENDING_BOOKING_SWEEP = 'expire-pending-booking-sweep'
export const QUEUE_REFRESH_MP_TOKENS = 'refresh-mp-tokens'
export const QUEUE_RECONCILE_PENDING_PAYMENTS = 'reconcile-pending-payments'
export const QUEUE_RETRY_PENDING_REFUNDS = 'retry-pending-refunds'
export const QUEUE_HEALTH_PING = 'health-ping'
export const QUEUE_RECONCILE_ACCOUNTING_DRIFT = 'reconcile-accounting-drift'
export const QUEUE_DAILY_SUMMARY = 'daily-summary'
export const QUEUE_ONBOARDING_ABANDONMENT = 'onboarding-abandonment-sweep'
export const QUEUE_RECONCILE_SUBSCRIPTIONS = 'reconcile-subscriptions'
export const QUEUE_WHATSAPP_TURN = 'whatsapp-turn'
export const QUEUE_WHATSAPP_TURN_RESCUE = 'whatsapp-turn-rescue'
export const QUEUE_WHATSAPP_OPS_ALERTS = 'whatsapp-ops-alerts'

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

// ─── Reconciliación de suscripciones SaaS ─────────────────────────────────────
// OJO: `boss.schedule(name, cron, data)` SIN cuarto argumento registra el cron
// con retryLimit=0 — el "reintento" pasa a ser el próximo tick, una hora
// después. Acá sí se pasan SendOptions porque el barrido es idempotente por
// construcción (escritura convergente + guard de marca de agua), así que
// reintentar ante un 5xx de MP es seguro y evita que un complejo que ya pagó
// espere una hora más para que le arreglen la suscripción.
//
// `expireInHours: 2` deja lugar a los 2 reintentos con backoff sin que dos
// corridas del cron horario se solapen.
export const RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS = {
  retryLimit: 2,
  retryDelay: 120,
  retryBackoff: true,
  expireInHours: 2,
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
    /** daily_summary (D8): día operativo que resume (YYYY-MM-DD) — insumo de la dedupeKey. */
    date?: string
    /** daily_summary (D8): copy pre-armado del resumen ("Ayer: $X · N/M · caja..."). */
    summaryLabel?: string
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

// ─── Bot de WhatsApp ──────────────────────────────────────────────────────────
// Un turno del bot por chat. Los jugadores escriben en ráfagas ("hola" /
// "tenés para hoy?" / "a las 21"): el job arranca 4 s después del primer
// mensaje y contesta todo junto.
//
// Por qué `useSingletonQueue` y no `singletonKey` a secas: en pg-boss 9 la
// `singletonKey` sola cubre también el estado `active`
// (node_modules/pg-boss/src/plans.js, índice job_singletonKey), así que un
// mensaje que llega MIENTRAS el turno corre perdía su job (`send` devuelve
// null) y quedaba sin respuesta. Con la cola singleton queda 1 job esperando
// además del que corre; el worker suma `enforceSingletonQueueActiveLimit` para
// que no corran dos del mismo chat a la vez.
//
// `retryLimit: 0`, OBLIGATORIO con la cola singleton: el índice único
// `job_singleton_queue` cubre los estados < `active`, y un reintento pasa el
// job de `active` a `retry`. Si ya había otro job del mismo chat esperando, ese
// UPDATE viola el índice: pg-boss se traga el error, el job queda `active` para
// siempre (el chat muere) y el `expire` de mantenimiento falla en cada ciclo
// para TODAS las colas. Sin reintentos, un fallo queda `failed`/`expired`, que
// no entran en el índice. El reintento real es el cron `whatsapp-turn-rescue`.
//
// `onComplete: true`: sin esto pg-boss 9 no emite el evento de cierre y la DLQ
// (`dlq.ts`) nunca ve el fallo.

export type WhatsappTurnJobData = { tenantId: string; chatId: string }

const WHATSAPP_TURN_DEBOUNCE_SECONDS = 4

export function whatsappTurnSendOptions(chatId: string) {
  return {
    singletonKey: chatId,
    useSingletonQueue: true,
    startAfter: WHATSAPP_TURN_DEBOUNCE_SECONDS,
    retryLimit: 0,
    // Más que el peor turno: 5 llamadas al modelo × (30 s de timeout × 3
    // intentos del SDK) ≈ 8 min. Un job que vence con el handler vivo deja de
    // contar como activo y el rescate arrancaría otro turno del mismo chat.
    expireInMinutes: 15,
    onComplete: true,
  } as const
}

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
