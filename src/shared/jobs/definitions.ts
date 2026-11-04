import type { Queue, SendOptions, WorkOptions } from 'pg-boss'
import { QUEUE_PROCESS_MP_WEBHOOK } from './queue-names'

/**
 * Centralized pg-boss queue names + queue registry + send options + work (poll) options.
 * Retry config lives on SendOptions (per enqueue) y, como default, en `QUEUE_DEFINITIONS`;
 * no en WorkOptions.
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
export const QUEUE_RIVAL_MAIL = 'rival-mail'
export const QUEUE_GENERATE_ABONADO_SLOTS = 'generate-abonado-slots'
export const QUEUE_DEAD_LETTER = 'dead-letter'

// ─── Registro de colas ───────────────────────────────────────────────────────
// pg-boss 12 exige que la cola exista antes de `send`/`schedule` (`PGBOSS_QUEUE_NOT_FOUND`):
// `ensureQueues` crea todas las de esta lista al arrancar. Una cola nueva SIEMPRE se agrega
// acá — el test de completitud falla si un `send(QUEUE_*)` o un `work`/`schedule` apunta a
// una que no figura.
//
// `retryLimit: 0` en todas: es el default que tenía la 9 (la 12 trae 2). Un tick de cron no
// se reintenta —el "retry" es el próximo tick— y cada `send` sigue pasando su propio
// `retryLimit`, que pisa este default por job.
//
// `deadLetter` SOLO en `whatsapp-turn`, que es lo que veía la DLQ de la 9 (era la única con
// `onComplete`). Ampliarlo a otras colas es una decisión aparte.

export type QueueDefinition = { name: string; options: Omit<Queue, 'name'> }

const NO_RETRY = { retryLimit: 0 } as const

export const QUEUE_DEFINITIONS: readonly QueueDefinition[] = [
  // La DLQ primero: `ensureQueues` la crea antes que el resto, porque `deadLetter` la referencia.
  { name: QUEUE_DEAD_LETTER, options: NO_RETRY },
  { name: QUEUE_PROCESS_MP_WEBHOOK, options: NO_RETRY },
  { name: QUEUE_GENERATE_ABONADO_SLOTS, options: NO_RETRY },
  { name: QUEUE_SEND_EMAIL, options: NO_RETRY },
  { name: QUEUE_EXPIRE_TRIALS, options: NO_RETRY },
  { name: QUEUE_AUTO_COMPLETE, options: NO_RETRY },
  { name: QUEUE_AUTO_CREDIT_UNPAID, options: NO_RETRY },
  { name: QUEUE_DUNNING_RETRY, options: NO_RETRY },
  { name: QUEUE_DATA_RETENTION, options: NO_RETRY },
  { name: QUEUE_EXPIRE_PENDING_BOOKING, options: NO_RETRY },
  { name: QUEUE_EXPIRE_PENDING_BOOKING_SWEEP, options: NO_RETRY },
  { name: QUEUE_REFRESH_MP_TOKENS, options: NO_RETRY },
  { name: QUEUE_RECONCILE_PENDING_PAYMENTS, options: NO_RETRY },
  { name: QUEUE_RECONCILE_ACCOUNTING_DRIFT, options: NO_RETRY },
  { name: QUEUE_RETRY_PENDING_REFUNDS, options: NO_RETRY },
  { name: QUEUE_PUSH_SEND, options: NO_RETRY },
  { name: QUEUE_HEALTH_PING, options: NO_RETRY },
  { name: QUEUE_DAILY_SUMMARY, options: NO_RETRY },
  { name: QUEUE_ONBOARDING_ABANDONMENT, options: NO_RETRY },
  { name: QUEUE_RECONCILE_SUBSCRIPTIONS, options: NO_RETRY },
  {
    name: QUEUE_WHATSAPP_TURN,
    options: {
      // Un job por chat: 1 esperando + 1 corriendo, nunca 2 activos del mismo `singletonKey`.
      policy: 'stately',
      retryLimit: 0,
      // Más que el peor turno (ver `whatsappTurnSendOptions`).
      expireInSeconds: 900,
      deadLetter: QUEUE_DEAD_LETTER,
    },
  },
  { name: QUEUE_WHATSAPP_TURN_RESCUE, options: NO_RETRY },
  { name: QUEUE_WHATSAPP_OPS_ALERTS, options: NO_RETRY },
  { name: QUEUE_RIVAL_MAIL, options: NO_RETRY },
]

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
// `satisfies SendOptions`: pg-boss 12 ignora en silencio las opciones que ya no existen
// (`expireInHours`, `teamSize`…), y solo el tipo las rechaza. Tipadas acá, una opción
// inválida no compila.

export const SEND_EMAIL_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 24 * 3600,
} satisfies SendOptions

export const EXPIRE_PENDING_BOOKING_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  // Comfortably outlives the 6 min timer + retries so a rescheduled job isn't dropped.
  expireInSeconds: 3600,
} satisfies SendOptions

// ─── Reconciliación de suscripciones SaaS ─────────────────────────────────────
// OJO: `boss.schedule(name, cron, data)` SIN cuarto argumento usa el default de la
// cola (`retryLimit: 0` en `QUEUE_DEFINITIONS`) — el "reintento" pasa a ser el próximo
// tick, una hora después. Acá sí se pasan SendOptions porque el barrido es idempotente
// por construcción (escritura convergente + guard de marca de agua), así que
// reintentar ante un 5xx de MP es seguro y evita que un complejo que ya pagó
// espere una hora más para que le arreglen la suscripción.
//
// `expireInSeconds: 2 h` deja lugar a los 2 reintentos con backoff sin que dos
// corridas del cron horario se solapen.
export const RECONCILE_SUBSCRIPTIONS_SEND_OPTIONS = {
  retryLimit: 2,
  retryDelay: 120,
  retryBackoff: true,
  expireInSeconds: 2 * 3600,
} satisfies SendOptions

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
  expireInSeconds: 3600,
} satisfies SendOptions

// ─── Bot de WhatsApp ──────────────────────────────────────────────────────────
// Un turno del bot por chat. Los jugadores escriben en ráfagas ("hola" /
// "tenés para hoy?" / "a las 21"): el job arranca 4 s después del primer
// mensaje y contesta todo junto.
//
// La exclusión por chat la da la POLÍTICA `stately` de la cola (`QUEUE_DEFINITIONS`,
// índice `job_i3` de pg-boss 12): por `singletonKey` hay 1 job esperando + 1 corriendo.
// Un mensaje que llega MIENTRAS el turno corre queda esperando (no se pierde) y `send`
// devuelve null si ya hay uno esperando: ese job va a leer también los mensajes nuevos.
// Con `localConcurrency: 4` nunca corren dos del mismo chat.
//
// `retryLimit: 0` sigue: el reintento real es el cron `whatsapp-turn-rescue`, que
// re-encola todo entrante sin procesar de hace más de 30 s. Un reintento de pg-boss
// competiría con ese rescate por el mismo chat.

export type WhatsappTurnJobData = { tenantId: string; chatId: string }

const WHATSAPP_TURN_DEBOUNCE_SECONDS = 4

export function whatsappTurnSendOptions(chatId: string) {
  return {
    singletonKey: chatId,
    startAfter: WHATSAPP_TURN_DEBOUNCE_SECONDS,
    retryLimit: 0,
    // Más que el peor turno: 5 llamadas al modelo × (30 s de timeout × 3
    // intentos del SDK) ≈ 8 min. Un job que vence con el handler vivo deja de
    // contar como activo y el rescate arrancaría otro turno del mismo chat.
    expireInSeconds: 900,
  } satisfies SendOptions
}

// ─── Mails de RIVAL ───────────────────────────────────────────────────────────
// El job NO manda el mail: al despertar revalida contra la base y recién ahí inserta la
// notificación (la manda `send-email`). Se difiere con `startAfter` para respetar la ventana
// silenciosa 00-08 ART; por eso `expireInSeconds` cubre la espera más los reintentos.
// `ref` de cada tipo: participantId (join_request/accepted) o matchId (canceled/alert_publish).

export type RivalMailJobData =
  | { type: 'join_request'; matchId: string; participantId: string }
  | { type: 'accepted'; matchId: string; participantId: string }
  | { type: 'canceled'; matchId: string }
  | { type: 'alert_publish'; matchId: string }

export const RIVAL_MAIL_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 24 * 3600,
} satisfies SendOptions

// ─── Poll tuning (WorkOptions) ─────────────────────────────────────────────────
// D5 (auditoría de datos, 2026-07-23): en prod, el poller de pg-boss
// (`WITH nextJob as (SELECT id FROM pgboss_v12.job ...)`) resultó la TOP query
// absoluta de la DB con la app sin tráfico — cada `boss.work()` sondea cada
// `pollingIntervalSeconds` (default 2 s). Las colas que solo dispara
// `boss.schedule` (cron) no necesitan esa latencia: la más frecuente corre cada
// 5 minutos, así que 30s de polling no le agrega demora perceptible al primer job
// pero corta el volumen de sondeos ~15x.
// Aplicar SOLO a colas cron — las latency-sensitive (webhooks de MP, push,
// email, expiración directa de reservas por-booking) quedan en el default.
export const CRON_WORK_OPTIONS = {
  pollingIntervalSeconds: 30,
} satisfies WorkOptions
