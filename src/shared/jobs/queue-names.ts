import type { SendOptions } from 'pg-boss'

/**
 * pg-boss queue names + per-queue send options.
 *
 * Retry config lives on the SendOptions (per enqueue) y, como default de cada cola, en
 * `QUEUE_DEFINITIONS` (definitions.ts). Centralizing here keeps enqueue sites DRY.
 */
export const QUEUE_PROCESS_MP_WEBHOOK = 'process-mp-webhook'

export const MP_WEBHOOK_SEND_OPTIONS = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 24 * 3600,
} satisfies SendOptions
