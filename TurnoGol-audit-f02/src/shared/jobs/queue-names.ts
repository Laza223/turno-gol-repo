/**
 * pg-boss queue names + per-queue send options.
 *
 * Retry config in pg-boss v9 lives on the SendOptions (per enqueue), not on
 * WorkOptions. Centralizing here keeps enqueue sites DRY.
 */
export const QUEUE_PROCESS_MP_WEBHOOK = 'process-mp-webhook'

export const MP_WEBHOOK_SEND_OPTIONS = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInHours: 24,
} as const
