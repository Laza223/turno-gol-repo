/**
 * Centralized pg-boss queue names + send options.
 * Retry config lives on SendOptions (per enqueue), not on WorkOptions (pg-boss v9).
 */

// ─── Queue names ─────────────────────────────────────────────────────────────

export const QUEUE_SEND_EMAIL = 'send-email'
export const QUEUE_EXPIRE_TRIALS = 'expire-trials'
export const QUEUE_AUTO_COMPLETE = 'auto-complete-bookings'
export const QUEUE_BOOKING_REMINDER = 'booking-reminder'
export const QUEUE_DUNNING_RETRY = 'dunning-retry'
export const QUEUE_DATA_RETENTION = 'data-retention-cleanup'

// ─── Job payload types ────────────────────────────────────────────────────────

export type SendEmailJobData = {
  notification_id: string
}

export type BookingReminderJobData = {
  booking_id: string
  player_id: string
  reminder_type: '24h'
}

// ─── Send options (retry config) ──────────────────────────────────────────────

export const SEND_EMAIL_SEND_OPTIONS = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInHours: 24,
} as const

export const BOOKING_REMINDER_SEND_OPTIONS = {
  retryLimit: 2,
  retryDelay: 300,
  retryBackoff: true,
} as const
